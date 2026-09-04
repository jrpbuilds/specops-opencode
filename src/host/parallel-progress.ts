/**
 * Runtime-owned ephemeral tracking of parallel specialist dispatches.
 *
 * OpenCode's plugin surface observes every SpecOps-parallel dispatch the
 * Coordinator makes: `tool.execute.before` sees each `task` call whose
 * `subagent_type` is the implementer or one of the three review critics, and
 * terminal outcomes arrive through the background-task envelope in
 * `tool.execute.after` (task id and immediate `running` state) and through
 * session lifecycle events (`session.created` for the child session,
 * `session.idle`/`session.error` for its completion or failure). This module
 * turns those observations into the parallel progress the Coordinator
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
 * call or the host event loop.
 *
 * Exports: `ParallelProgressSnapshot`, `recordTaskDispatch`, `recordTaskResult`,
 * `createSessionEventObserver`, `snapshotParallelProgress`,
 * `__resetParallelProgressForTesting`.
 */
import type { Hooks } from "@opencode-ai/plugin";
import { AGENT_IDS } from "../agents/ids.js";
import {
    REVIEW_CRITIC_IDS,
    type ReviewCriticId,
    type ReviewFanoutSnapshot,
} from "../coordinator/review-fanout.js";
import type {
    ImplementerDispatchObservation,
    ImplementerDispatchState,
} from "../coordinator/implementer-progress.js";
import { getSessionBinding } from "./session-bindings.js";

/** Runtime-derived parallel progress for one coordinator session. */
export type ParallelProgressSnapshot = {
    /** Raw fan-out state lists; omitted when no critic dispatch was observed. */
    readonly reviewFanout?: ReviewFanoutSnapshot;
    /** Observed implementer dispatches in dispatch order. */
    readonly implementerDispatches?: readonly ImplementerDispatchObservation[];
};

/** One tracked dispatch, keyed by its task-tool call id. */
type DispatchEntry = {
    role: typeof AGENT_IDS.implementer | ReviewCriticId;
    state: ImplementerDispatchState;
    /** Linked child session id (the background task id) once known. */
    childSessionId?: string;
};

/** Per-coordinator-session run state. */
type ParallelRunState = {
    /** Dispatch entries in observation order, keyed by task-tool call id. */
    dispatches: Map<string, DispatchEntry>;
};

/** Coordinator session id -> run state. */
const runs = new Map<string, ParallelRunState>();

/** Child session id -> the coordinator session and call it belongs to. */
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

/** Get or create the run state for one coordinator session. */
function runFor(sessionId: string): ParallelRunState {
    let run = runs.get(sessionId);
    if (!run) {
        run = { dispatches: new Map() };
        runs.set(sessionId, run);
    }
    return run;
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

/**
 * A critic re-dispatch (one whose id was already seen this run) means a new
 * fan-out round — remediation re-review re-runs the complete fan-out, never a
 * subset — so every critic entry from the previous round is cleared before
 * the new one is recorded. Implementer entries are unaffected.
 */
function resetSupersededCritics(run: ParallelRunState): void {
    for (const [callId, entry] of run.dispatches) {
        if (entry.role !== AGENT_IDS.implementer) run.dispatches.delete(callId);
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
        if (!getSessionBinding(input.sessionID)) return;
        const subagentType = output?.args?.subagent_type;
        if (!isTrackedRole(subagentType)) return;
        const criticId = criticIdFor(subagentType);
        const run = runFor(input.sessionID);
        if (criticId !== undefined) {
            const seen = [...run.dispatches.values()].some(entry => entry.role === criticId);
            if (seen) resetSupersededCritics(run);
            run.dispatches.set(input.callID, { role: criticId, state: "inFlight" });
        } else {
            run.dispatches.set(input.callID, {
                role: AGENT_IDS.implementer,
                state: "inFlight",
            });
        }
        pruneImplementers(run);
    } catch {
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

/** Link one in-flight entry to its child session id. */
function linkChild(sessionId: string, callId: string, childSessionId: string): void {
    const run = runs.get(sessionId);
    const entry = run?.dispatches.get(callId);
    if (!run || !entry || entry.childSessionId !== undefined) return;
    entry.childSessionId = childSessionId;
    callByChild.set(childSessionId, { sessionId, callId });
}

/** Mark the entry linked to one child session id terminal, if it is in flight. */
function markChildTerminal(childSessionId: string, state: "completed" | "failed"): void {
    const link = callByChild.get(childSessionId);
    if (!link) return;
    const entry = runs.get(link.sessionId)?.dispatches.get(link.callId);
    if (!entry || entry.state !== "inFlight") return;
    entry.state = state;
}

/**
 * Observe one `tool.execute.after` hook and resolve a tracked dispatch.
 *
 * Foreground task calls terminate here directly. Background calls return the
 * documented `<task id=… state="running">` envelope, so the task id is linked
 * to the call and the entry stays in flight until a session lifecycle event
 * resolves it; an immediately terminal envelope state is honoured as-is.
 */
export async function recordTaskResult(
    input: AfterHookInput,
    output: AfterHookOutput,
): Promise<void> {
    try {
        if (input.tool !== "task" || !input.callID) return;
        const run = runs.get(input.sessionID);
        const entry = run?.dispatches.get(input.callID);
        if (!entry || entry.state !== "inFlight") return;
        const tag = parseTaskTag(output?.output ?? "");
        if (input.args?.background === true) {
            if (tag?.id) linkChild(input.sessionID, input.callID, tag.id);
            if (tag?.state === "completed") entry.state = "completed";
            if (tag?.state === "error") entry.state = "failed";
            return;
        }
        entry.state = "completed";
    } catch {
        // Fail open: observation must never break the model's task result.
    }
}

/**
 * Build the `event` hook that resolves tracked dispatches from session
 * lifecycle events.
 *
 * `session.created` corroborates the child-session link of the oldest
 * in-flight entry under the parent when the background envelope could not be
 * parsed; `session.idle` completes and `session.error`/`session.deleted`
 * fail the entry linked to the child session.
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
                if (!info?.id || !info.parentID || callByChild.has(info.id)) return;
                const run = runs.get(info.parentID);
                if (!run) return;
                for (const [callId, entry] of run.dispatches) {
                    if (entry.state === "inFlight" && entry.childSessionId === undefined) {
                        linkChild(info.parentID, callId, info.id);
                        return;
                    }
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
 * Snapshot the runtime-derived parallel progress for one coordinator session.
 *
 * Pure read over the observed entries: critics project onto the canonical
 * snapshot lists (every critic appears in exactly one list, so the snapshot
 * always satisfies `summarizeReviewFanout`'s contract), implementers project
 * in dispatch order with the linked background task id as `dispatchId` when
 * one is known. A session with no tracked work returns an empty snapshot.
 */
export function snapshotParallelProgress(sessionID: string): ParallelProgressSnapshot {
    const run = runs.get(sessionID);
    if (!run) return {};

    const latestCritic = new Map<ReviewCriticId, DispatchEntry>();
    const implementers: DispatchEntry[] = [];
    for (const entry of run.dispatches.values()) {
        if (entry.role === AGENT_IDS.implementer) {
            implementers.push(entry);
        } else {
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
        ...(reviewFanout ? { reviewFanout } : {}),
        ...(implementerDispatches ? { implementerDispatches } : {}),
    };
}

/** Clear every run and child link; test isolation only. */
export function __resetParallelProgressForTesting(): void {
    runs.clear();
    callByChild.clear();
}
