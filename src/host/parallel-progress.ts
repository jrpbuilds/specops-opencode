/**
 * Runtime-owned ephemeral tracking of parallel specialist dispatches.
 *
 * OpenCode's plugin surface observes every SpecOps-parallel dispatch the
 * Orchestrator makes: `tool.execute.before` sees each `task` call whose
 * `subagent_type` is the implementer or one of the three review critics, and
 * terminal outcomes arrive through the background-task envelope in
 * `tool.execute.after` (task id and immediate `running` state) and through
 * session lifecycle events (`session.created` for the child session,
 * `session.idle`/`session.error` for its completion or failure). This module
 * turns those observations into the parallel progress the Orchestrator
 * previously had to maintain itself and resupply through `specops_progress`
 * arguments and Todo bookkeeping.
 *
 * The state is strictly presentation-scoped, mirroring `session-bindings.ts`:
 * process-scoped, never persisted, never fed to workflow routing, gating, or
 * review/archive decisions, and never promoted to durable workflow authority.
 * Durable OpenSpec task state remains the only completion authority; a stale
 * projected entry can at worst mislabel a diagnostic view and is reconciled
 * against fresh durable state on every progress read. Entries die with the
 * process, so recovery naturally starts from empty projections.
 *
 * All seams fail open by construction: unmatched tools, unbound sessions,
 * unexpected shapes, and unknown events pass through untouched, and nothing
 * is ever thrown — an observation failure must never break the model's tool
 * call or the host event loop. Implementer entries additionally carry the
 * scoped assignment parsed from the dispatch payload (whole-list dispatches
 * carry none), exposed through `snapshotActiveImplementers` as the active
 * ownership the dispatch-boundary invariants check against. The blocking
 * itself belongs to `./dispatch-gate.ts`, which composes before this observer
 * so a rejected dispatch is never retained.
 *
 * Exports: `ParallelProgressSnapshot`, `recordTaskDispatch`, `recordTaskResult`,
 * `reserveImplementerDispatch`, `releaseImplementerDispatch`,
 * `createSessionEventObserver`, `snapshotParallelProgress`,
 * `snapshotActiveImplementers`, `__resetParallelProgressForTesting`.
 */
import type { Hooks } from "@opencode-ai/plugin";
import { AGENT_IDS } from "../agents/ids.js";
import {
    REVIEW_CRITIC_IDS,
    type ReviewCriticId,
    type ReviewFanoutSnapshot,
} from "../orchestrator/review-fanout.js";
import {
    parseReviewLaneDispatch,
    type ReviewLaneRoundSnapshot,
} from "../orchestrator/review-lanes.js";
import {
    parseAssignedTaskIds,
    type ActiveImplementerAssignment,
    type ImplementerDispatchObservation,
    type ImplementerDispatchState,
} from "../orchestrator/implementer-progress.js";
import { getSessionBinding } from "./session-bindings.js";
import {
    __resetReviewLanesForTesting,
    getReviewLaneRound,
    linkReviewLaneChild,
    markReviewLaneChildTerminal,
    observeReviewLaneTaskResult,
} from "./review-lanes.js";

/** Runtime-derived parallel progress for one orchestrator session. */
export type ParallelProgressSnapshot = {
    /** Raw fan-out state lists; omitted when no critic dispatch was observed. */
    readonly reviewFanout?: ReviewFanoutSnapshot;
    /** Model-selected dynamic lane state; omitted when no lane round is active. */
    readonly reviewLanes?: ReviewLaneRoundSnapshot;
    /** Observed implementer dispatches in dispatch order. */
    readonly implementerDispatches?: readonly ImplementerDispatchObservation[];
};

/** One tracked dispatch, keyed by its task-tool call id. */
type DispatchEntry = {
    role: typeof AGENT_IDS.implementer | ReviewCriticId;
    state: ImplementerDispatchState;
    /** Present for a dispatch belonging to an explicitly registered lane round. */
    reviewRoundId?: string;
    /** Implementer dispatch is awaiting the boundary's durable validation. */
    pendingValidation?: boolean;
    /** Linked child session id (the background task id) once known. */
    childSessionId?: string;
    /**
     * Implementer entries only: the scoped ids parsed from the dispatch
     * payload. Undefined covers the whole-list assignment and critics.
     */
    taskIds?: readonly string[];
};

/** Per-orchestrator-session run state. */
type ParallelRunState = {
    /** Dispatch entries in observation order, keyed by task-tool call id. */
    dispatches: Map<string, DispatchEntry>;
};

/** Orchestrator session id -> run state. */
const runs = new Map<string, ParallelRunState>();

/** Child session id -> the orchestrator session and call it belongs to. */
const callByChild = new Map<string, { sessionId: string; callId: string }>();

/** Bound on tracked implementer entries per run; drops oldest terminal first. */
const MAX_IMPLEMENTER_ENTRIES = 128;

/** Dispatch-observed agent ids of the three critics, in canonical critic order. */
const CRITIC_AGENT_IDS: readonly string[] = [
    AGENT_IDS.reviewCorrectness,
    AGENT_IDS.reviewRisk,
    AGENT_IDS.reviewQuality,
];

/** Map one critic agent id onto its canonical critic id. */
function criticIdFor(subagentType: string): ReviewCriticId | undefined {
    const index = CRITIC_AGENT_IDS.indexOf(subagentType);
    return index === -1 ? undefined : REVIEW_CRITIC_IDS[index];
}

/** Whether one `task` `subagent_type` names a SpecOps role this module tracks. */
function isTrackedRole(
    subagentType: unknown,
): subagentType is typeof AGENT_IDS.implementer | string {
    return (
        subagentType === AGENT_IDS.implementer ||
        (typeof subagentType === "string" && CRITIC_AGENT_IDS.includes(subagentType))
    );
}

/** Get or create the run state for one orchestrator session. */
function runFor(sessionId: string): ParallelRunState {
    let run = runs.get(sessionId);
    if (!run) {
        run = { dispatches: new Map() };
        runs.set(sessionId, run);
    }
    return run;
}

/**
 * Reserve one implementer dispatch before an asynchronous durable read.
 *
 * This mutation is intentionally synchronous: concurrently started task hooks
 * cannot interleave between the gate's ownership snapshot and this reservation,
 * so later gates in the same assistant message observe the reservation.
 */
export function reserveImplementerDispatch(
    sessionID: string,
    callID: string,
    taskIds: readonly string[] | undefined,
): void {
    const run = runFor(sessionID);
    run.dispatches.set(callID, {
        role: AGENT_IDS.implementer,
        state: "inFlight",
        pendingValidation: true,
        ...(taskIds === undefined ? {} : { taskIds }),
    });
}

/** Remove a provisional implementer dispatch when boundary validation fails. */
export function releaseImplementerDispatch(sessionID: string, callID: string): void {
    const run = runs.get(sessionID);
    const entry = run?.dispatches.get(callID);
    if (entry?.role === AGENT_IDS.implementer && entry.pendingValidation) {
        run?.dispatches.delete(callID);
    }
}

/**
 * Drop the oldest terminal implementer entry when a run outgrows the cap, so
 * long-lived processes cannot accumulate unbounded entries while in-flight
 * work is always retained.
 */
function pruneImplementers(run: ParallelRunState): void {
    const implementerKeys = [...run.dispatches.entries()]
        .filter(([, entry]) => entry.role === AGENT_IDS.implementer)
        .map(([callId]) => callId);
    let excess = implementerKeys.length - MAX_IMPLEMENTER_ENTRIES;
    for (const callId of implementerKeys) {
        if (excess <= 0) return;
        const entry = run.dispatches.get(callId);
        if (entry && entry.state !== "inFlight") {
            run.dispatches.delete(callId);
            excess -= 1;
        }
    }
}

/** Hook-shaped input/output types, derived so the seams stay compatible. */
type BeforeHookInput = Parameters<NonNullable<Hooks["tool.execute.before"]>>[0];
type BeforeHookOutput = Parameters<NonNullable<Hooks["tool.execute.before"]>>[1];
type AfterHookInput = Parameters<NonNullable<Hooks["tool.execute.after"]>>[0];
type AfterHookOutput = Parameters<NonNullable<Hooks["tool.execute.after"]>>[1];

/**
 * Observe one `tool.execute.before` hook and record a SpecOps-parallel
 * implementer or review-critic dispatch.
 *
 * Only `task` calls from sessions with a recorded SpecOps binding whose
 * `subagent_type` names a tracked role are recorded; everything else passes
 * through untouched.
 */
export async function recordTaskDispatch(
    input: BeforeHookInput,
    output: BeforeHookOutput,
): Promise<void> {
    try {
        if (input.tool !== "task" || !input.callID) return;
        if (!getSessionBinding(input.sessionID)) {
            releaseImplementerDispatch(input.sessionID, input.callID);
            return;
        }
        const subagentType = output?.args?.subagent_type;
        if (!isTrackedRole(subagentType)) {
            releaseImplementerDispatch(input.sessionID, input.callID);
            return;
        }
        const criticId = criticIdFor(subagentType);
        const run = runFor(input.sessionID);
        if (criticId !== undefined) {
            releaseImplementerDispatch(input.sessionID, input.callID);
            const prompt =
                typeof output?.args?.prompt === "string" ? output.args.prompt : undefined;
            const lane = parseReviewLaneDispatch(prompt);
            run.dispatches.set(input.callID, {
                role: criticId,
                state: "inFlight",
                ...(lane.ok ? { reviewRoundId: lane.identity.roundId } : {}),
            });
        } else {
            const reserved = run.dispatches.get(input.callID);
            if (reserved?.role === AGENT_IDS.implementer && reserved.pendingValidation) {
                reserved.pendingValidation = false;
            } else {
                const parse = parseAssignedTaskIds(
                    typeof output?.args?.prompt === "string" ? output.args.prompt : undefined,
                );
                run.dispatches.set(input.callID, {
                    role: AGENT_IDS.implementer,
                    state: "inFlight",
                    ...(parse.status === "present" ? { taskIds: parse.taskIds } : {}),
                });
            }
        }
        pruneImplementers(run);
    } catch {
        if (input.callID) releaseImplementerDispatch(input.sessionID, input.callID);
        // Fail open: observation must never break the model's task dispatch.
    }
}

/** Extract the first `<task …>` tag's `id` and `state` attributes. */
function parseTaskTag(output: string): { id?: string; state?: string } | undefined {
    const match = /<task\b[^>]*>/.exec(output);
    if (!match) return undefined;
    const tag = match[0];
    const id = /\bid\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s"'>]+))/.exec(tag);
    const state = /\bstate\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s"'>]+))/.exec(tag);
    return {
        id: id?.[1] ?? id?.[2] ?? id?.[3],
        state: state?.[1] ?? state?.[2] ?? state?.[3],
    };
}

/**
 * Link a tracked Task entry to a child ID attributed to that call.
 *
 * For a review lane, this exact call-ID link is the only route into lane child
 * tracking; the parent-only lifecycle fallback intentionally excludes lanes.
 *
 * @param sessionId Parent Orchestrator session.
 * @param callId Tracked Task call ID.
 * @param childSessionId Child ID returned by the call or uniquely corroborated by the host.
 */
function linkChild(sessionId: string, callId: string, childSessionId: string): void {
    const run = runs.get(sessionId);
    const entry = run?.dispatches.get(callId);
    if (!run || !entry || entry.childSessionId !== undefined) return;
    const existing = callByChild.get(childSessionId);
    if (
        existing &&
        (existing.sessionId !== sessionId || existing.callId !== callId) &&
        runs.get(existing.sessionId)?.dispatches.get(existing.callId)?.state === "inFlight"
    ) {
        return;
    }
    entry.childSessionId = childSessionId;
    callByChild.set(childSessionId, { sessionId, callId });
    linkReviewLaneChild(sessionId, callId, childSessionId);
}

/**
 * Mark a call-correlated child result terminal in both generic and lane state.
 *
 * @param childSessionId Child session ID observed by the lifecycle hook.
 * @param state Terminal execution state to record.
 * @returns Nothing; missing or already-terminal links are ignored.
 */
function markChildTerminal(childSessionId: string, state: "completed" | "failed"): void {
    markReviewLaneChildTerminal(childSessionId, state);
    const link = callByChild.get(childSessionId);
    if (!link) return;
    const entry = runs.get(link.sessionId)?.dispatches.get(link.callId);
    if (!entry || entry.state !== "inFlight") {
        callByChild.delete(childSessionId);
        return;
    }
    entry.state = state;
    if (entry.reviewRoundId) runs.get(link.sessionId)?.dispatches.delete(link.callId);
    callByChild.delete(childSessionId);
}

/**
 * Observe one `tool.execute.after` hook and resolve a tracked dispatch.
 *
 * Foreground task calls terminate here directly unless their explicit task
 * envelope reports `running` or an unknown state. Background calls return the
 * documented `<task id=… state="running">` envelope; its child ID is linked
 * to the exact call and lifecycle events resolve it later. Explicit errors are
 * forwarded to review-lane state as failures rather than successful returns.
 *
 * @param input Host after-hook identity and Task arguments.
 * @param output Host after-hook Task result.
 * @returns A resolved promise; observer failures never escape the hook.
 */
export async function recordTaskResult(
    input: AfterHookInput,
    output: AfterHookOutput,
): Promise<void> {
    try {
        if (input.tool !== "task" || !input.callID) return;
        const tag = parseTaskTag(output?.output ?? "");
        observeReviewLaneTaskResult({
            sessionID: input.sessionID,
            callID: input.callID,
            background: input.args?.background === true,
            ...(tag?.id === undefined ? {} : { childSessionId: tag.id }),
            ...(tag?.state === undefined ? {} : { taskState: tag.state }),
        });
        const run = runs.get(input.sessionID);
        const entry = run?.dispatches.get(input.callID);
        if (!entry || entry.state !== "inFlight") return;
        if (input.args?.background === true) {
            if (tag?.id) linkChild(input.sessionID, input.callID, tag.id);
            if (tag?.state === "completed") entry.state = "completed";
            if (tag?.state === "error") entry.state = "failed";
            if (entry.reviewRoundId && entry.state !== "inFlight") {
                run?.dispatches.delete(input.callID);
            }
            if (
                tag?.id &&
                (tag.state === "completed" || tag.state === "error") &&
                callByChild.get(tag.id)?.sessionId === input.sessionID &&
                callByChild.get(tag.id)?.callId === input.callID
            ) {
                callByChild.delete(tag.id);
            }
            return;
        }
        entry.state = "completed";
        if (entry.reviewRoundId) run?.dispatches.delete(input.callID);
    } catch {
        // Fail open: observation must never break the model's task result.
    }
}

/**
 * Build the `event` hook that resolves tracked dispatches from session
 * lifecycle events.
 *
 * `session.created` may corroborate a child link for non-review-lane dispatches
 * only when exactly one eligible unlinked entry is in flight under the parent.
 * Review lanes require a child ID from their call-correlated Task result;
 * unrelated child events never claim them. `session.idle` completes and
 * `session.error`/`session.deleted` fail an already linked child entry.
 *
 * @returns A fail-open observer for host session lifecycle events.
 */
export function createSessionEventObserver(): NonNullable<Hooks["event"]> {
    return async input => {
        try {
            const event = input.event as {
                type?: string;
                properties?: { sessionID?: string; info?: { id?: string; parentID?: string } };
            };
            if (event.type === "session.created") {
                const info = event.properties?.info;
                if (!info?.id || !info.parentID) return;
                const linked = callByChild.get(info.id);
                if (
                    linked &&
                    runs.get(linked.sessionId)?.dispatches.get(linked.callId)?.state === "inFlight"
                ) {
                    return;
                }
                const run = runs.get(info.parentID);
                if (!run) return;
                const candidates = [...run.dispatches.entries()].filter(
                    ([, entry]) =>
                        entry.state === "inFlight" &&
                        entry.childSessionId === undefined &&
                        entry.reviewRoundId === undefined,
                );
                if (candidates.length === 1) {
                    linkChild(info.parentID, candidates[0][0], info.id);
                }
                return;
            }
            if (event.type === "session.idle") {
                const sessionID = event.properties?.sessionID;
                if (sessionID) markChildTerminal(sessionID, "completed");
                return;
            }
            if (event.type === "session.error" || event.type === "session.deleted") {
                const sessionID =
                    event.type === "session.error"
                        ? event.properties?.sessionID
                        : event.properties?.info?.id;
                if (sessionID) markChildTerminal(sessionID, "failed");
            }
        } catch {
            // Fail open: observation must never break the host event loop.
        }
    };
}

/**
 * Snapshot the runtime-derived parallel progress for one orchestrator session.
 *
 * Pure read over observed entries: legacy critic dispatches project onto the
 * canonical three-lens snapshot; registered dynamic rounds project separately
 * with their model-supplied lanes. Implementers project in dispatch order with
 * the linked background task id as `dispatchId` when known. A session with no
 * tracked work returns an empty snapshot.
 */
export function snapshotParallelProgress(sessionID: string): ParallelProgressSnapshot {
    const binding = getSessionBinding(sessionID);
    const reviewLanes = binding ? getReviewLaneRound(sessionID, binding.change) : undefined;
    const run = runs.get(sessionID);
    if (!run) return reviewLanes ? { reviewLanes } : {};

    const latestCritic = new Map<ReviewCriticId, DispatchEntry>();
    const implementers: DispatchEntry[] = [];
    for (const entry of run.dispatches.values()) {
        if (entry.role === AGENT_IDS.implementer) {
            implementers.push(entry);
        } else if (entry.reviewRoundId === undefined) {
            latestCritic.set(entry.role, entry);
        }
    }

    let reviewFanout: ReviewFanoutSnapshot | undefined;
    if (latestCritic.size > 0) {
        const lists: Record<"pending" | ImplementerDispatchState, string[]> = {
            pending: [],
            inFlight: [],
            completed: [],
            failed: [],
        };
        for (const critic of REVIEW_CRITIC_IDS) {
            const entry = latestCritic.get(critic);
            lists[entry ? entry.state : "pending"].push(critic);
        }
        reviewFanout = {
            pending: lists.pending,
            inFlight: lists.inFlight,
            completed: lists.completed,
            failed: lists.failed,
        };
    }
    const implementerDispatches =
        implementers.length > 0
            ? implementers.map(entry =>
                  entry.childSessionId !== undefined
                      ? { dispatchId: entry.childSessionId, state: entry.state }
                      : { state: entry.state },
              )
            : undefined;
    return {
        ...(reviewLanes ? { reviewLanes } : {}),
        ...(reviewFanout ? { reviewFanout } : {}),
        ...(implementerDispatches ? { implementerDispatches } : {}),
    };
}

/** In-flight implementer ownership for one orchestrator session. */
export type ActiveImplementers = {
    /** Number of implementer dispatches currently in flight. */
    readonly count: number;
    /** Their assignments in dispatch order; whole-list entries carry no ids. */
    readonly assignments: readonly ActiveImplementerAssignment[];
};

/**
 * Snapshot the implementer ownership the dispatch-boundary invariants check
 * against: every implementer entry still in flight, labelled by its linked
 * background task id when known and by its task-tool call id otherwise.
 * Terminal (completed/failed) entries release ownership; unbound and unknown
 * sessions return an empty view. A read-only projection — callers can never
 * mutate the tracked entries through it.
 */
export function snapshotActiveImplementers(sessionID: string): ActiveImplementers {
    const run = runs.get(sessionID);
    if (!run) return { count: 0, assignments: [] };

    const assignments: ActiveImplementerAssignment[] = [];
    for (const [callId, entry] of run.dispatches) {
        if (entry.role !== AGENT_IDS.implementer || entry.state !== "inFlight") continue;
        assignments.push({
            dispatchId: entry.childSessionId ?? callId,
            ...(entry.taskIds === undefined ? {} : { taskIds: entry.taskIds }),
        });
    }
    return { count: assignments.length, assignments };
}

/** Clear every run and child link; test isolation only. */
export function __resetParallelProgressForTesting(): void {
    runs.clear();
    callByChild.clear();
    __resetReviewLanesForTesting();
}
