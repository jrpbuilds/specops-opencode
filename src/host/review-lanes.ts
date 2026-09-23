/** Ephemeral, runtime-owned review-lane state for one Orchestrator session. */
import type {
    ReviewLaneDefinition,
    ReviewLaneExecutionState,
    ReviewLens,
    ReviewLaneRoundSnapshot,
} from "../orchestrator/review-lanes.js";
import { validateReviewLanes } from "../orchestrator/review-lanes.js";

type LaneState = {
    definition: ReviewLaneDefinition;
    state: ReviewLaneExecutionState;
    attempts: number;
    activeCallId?: string;
};

type ReviewRound = {
    roundId: string;
    change: string;
    lanes: Map<string, LaneState>;
};

type DispatchRef = {
    sessionID: string;
    callID: string;
    roundId: string;
    laneId: string;
    attempt: number;
    childSessionId?: string;
};

const rounds = new Map<string, ReviewRound>();
const dispatchByCall = new Map<string, DispatchRef>();
const dispatchByChild = new Map<string, DispatchRef>();
let nextRoundIdentity = 0;

/**
 * Register a complete Orchestrator-selected lane set as a fresh review round.
 *
 * @param sessionID Bound Orchestrator session that owns the round.
 * @param change Active change name for the selected plan.
 * @param input Untrusted lane definitions validated before state is replaced.
 * @returns The fresh round snapshot with every lane pending.
 * @throws When input is malformed or the current round still has active lanes.
 */
export function startReviewLaneRound(
    sessionID: string,
    change: string,
    input: unknown,
): ReviewLaneRoundSnapshot {
    if (!sessionID)
        throw new Error("a bound Orchestrator session is required to start review lanes");
    const name = change.trim();
    if (!name) throw new Error("an active change is required to start review lanes");

    const validation = validateReviewLanes(input);
    if (!validation.ok) throw new Error(`Cannot start review round: ${validation.error}`);

    const previous = rounds.get(sessionID);
    if (previous && countInFlight(previous) > 0) {
        throw new Error(
            `Cannot replace review round '${previous.roundId}' while review lanes are in flight`,
        );
    }
    if (previous) removeRoundDispatches(sessionID, previous.roundId);

    const round: ReviewRound = {
        roundId: `review-round-${++nextRoundIdentity}`,
        change: name,
        lanes: new Map(
            validation.lanes.map(lane => [
                lane.id,
                { definition: lane, state: "pending", attempts: 0 },
            ]),
        ),
    };
    rounds.set(sessionID, round);
    return toSnapshot(round);
}

/**
 * Read a lane round only for its owning change; a mismatch never invalidates it.
 *
 * Callers handling a user-requested change switch must use
 * {@link switchReviewLaneChange} so active capacity is checked before the
 * binding changes.
 *
 * @param sessionID Orchestrator session that owns the round.
 * @param change Change name the caller expects the round to belong to.
 * @returns The matching round snapshot, or `undefined` without mutating state.
 */
export function getReviewLaneRound(
    sessionID: string,
    change: string,
): ReviewLaneRoundSnapshot | undefined {
    const round = rounds.get(sessionID);
    if (!round) return undefined;
    if (round.change !== change.trim()) return undefined;
    return toSnapshot(round);
}

/**
 * Safely transition a session binding to another change.
 *
 * A running lane round keeps its identity and reservations until all workers
 * terminate; rejecting before the binding changes prevents a new round from
 * reusing capacity still consumed by old workers. A terminal old round is
 * invalidated, while a round already registered for the requested change is
 * preserved.
 *
 * @param sessionID Orchestrator session whose binding is changing.
 * @param nextChange Proposed active change name.
 * @returns Nothing when the transition is safe; throws before mutation if old
 *   review lanes are still consuming capacity.
 */
export function switchReviewLaneChange(sessionID: string, nextChange: string): void {
    const round = rounds.get(sessionID);
    const name = nextChange.trim();
    if (!round || round.change === name) return;
    const inFlight = countInFlight(round);
    if (inFlight > 0) {
        throw new Error(
            `Cannot switch active change from '${round.change}' to '${name}' while ${inFlight} review lane(s) are in flight`,
        );
    }
    invalidateReviewLaneRound(sessionID);
}

/**
 * Abandon a round with no in-flight lanes before switching to a direct route.
 *
 * @param sessionID Orchestrator session that owns the round.
 * @param roundId Expected active round identity.
 * @throws When the identity is stale or any lane is still in flight.
 */
export function clearReviewLaneRound(sessionID: string, roundId: string): void {
    const round = requireRound(sessionID, roundId);
    const inFlight = countInFlight(round);
    if (inFlight > 0) {
        throw new Error(
            `Cannot clear review round '${roundId}' while ${inFlight} lane(s) are in flight`,
        );
    }
    removeRoundDispatches(sessionID, roundId);
    rounds.delete(sessionID);
}

/**
 * Return a completed or failed lane to pending for an explicit same-plan retry.
 *
 * @param sessionID Orchestrator session that owns the round.
 * @param roundId Expected active round identity.
 * @param laneId Lane whose terminal execution should be retried.
 * @throws When the round or lane is unknown, or the lane is not terminal.
 */
export function retryReviewLane(sessionID: string, roundId: string, laneId: string): void {
    const round = requireRound(sessionID, roundId);
    const lane = round.lanes.get(laneId);
    if (!lane) throw new Error(`Unknown review lane '${laneId}' in round '${roundId}'`);
    if (lane.state !== "completed" && lane.state !== "failed") {
        throw new Error(
            `Review lane '${laneId}' can be retried only after completion or failure; current state is '${lane.state}'`,
        );
    }
    lane.state = "pending";
    lane.activeCallId = undefined;
}

/**
 * Reserve one pending lane synchronously before its Task dispatch can execute.
 *
 * @param input Change, lane identity, role lens, call identity, and configured capacity.
 * @throws When identity/scope/lens/state is invalid or review capacity is exhausted.
 */
export function reserveReviewLaneDispatch(input: {
    readonly sessionID: string;
    readonly callID: string;
    readonly change: string;
    readonly roundId: string;
    readonly laneId: string;
    readonly scope: string;
    readonly lens: ReviewLens;
    readonly maxConcurrency: number;
}): void {
    const round = requireRound(input.sessionID, input.roundId);
    if (round.change !== input.change) {
        throw new Error(
            `Review round '${input.roundId}' belongs to '${round.change}', not active change '${input.change}'`,
        );
    }
    const lane = round.lanes.get(input.laneId);
    if (!lane) {
        throw new Error(`Unknown review lane '${input.laneId}' in round '${input.roundId}'`);
    }
    if (lane.definition.lens !== input.lens) {
        throw new Error(
            `Review lane '${input.laneId}' uses lens '${lane.definition.lens}', not '${input.lens}'`,
        );
    }
    if (lane.definition.scope !== input.scope) {
        throw new Error(`Review lane '${input.laneId}' scope does not match its registered scope`);
    }
    if (lane.state !== "pending") {
        throw new Error(
            `Review lane '${input.laneId}' is '${lane.state}'; explicitly retry a terminal lane before redispatch`,
        );
    }
    if (!Number.isInteger(input.maxConcurrency) || input.maxConcurrency < 1) {
        throw new Error("Review lane concurrency must be a positive integer");
    }
    const active = countInFlight(round);
    if (active >= input.maxConcurrency) {
        throw new Error(
            `Review lane capacity reached (${active}/${input.maxConcurrency} in flight); wait for a lane to finish before refilling`,
        );
    }

    const callKey = callKeyFor(input.sessionID, input.callID);
    if (dispatchByCall.has(callKey)) {
        throw new Error(`Task call '${input.callID}' is already associated with a review lane`);
    }
    lane.attempts += 1;
    lane.state = "inFlight";
    lane.activeCallId = input.callID;
    dispatchByCall.set(callKey, {
        sessionID: input.sessionID,
        callID: input.callID,
        roundId: input.roundId,
        laneId: input.laneId,
        attempt: lane.attempts,
    });
}

/**
 * Observe one Task result and update only the attempt reserved for its call ID.
 *
 * Successful foreground output and explicit `completed` background state finish
 * a lane. Explicit `error` or `failed` state fails it. `running` and unknown
 * explicit states stay in flight so they cannot satisfy fan-in accidentally.
 *
 * @param input Call identity and the host-observed execution result.
 * @returns Nothing; unmatched or non-terminal observations leave lane state unchanged.
 */
export function observeReviewLaneTaskResult(input: {
    readonly sessionID: string;
    readonly callID: string;
    readonly background: boolean;
    readonly childSessionId?: string;
    readonly taskState?: string;
}): void {
    const ref = dispatchByCall.get(callKeyFor(input.sessionID, input.callID));
    if (!ref) return;
    if (input.childSessionId)
        linkReviewLaneChild(input.sessionID, input.callID, input.childSessionId);

    if (input.taskState === "error" || input.taskState === "failed") {
        finishAttempt(ref, "failed");
        return;
    }

    if (input.background) {
        if (input.taskState === "completed") finishAttempt(ref, "completed");
        return;
    }

    if (input.taskState === undefined || input.taskState === "completed") {
        finishAttempt(ref, "completed");
    }
}

/**
 * Link a child only to the Task call ID already reserved by the dispatch gate.
 *
 * The generic `session.created` fallback cannot establish this lane identity;
 * only a call-correlated task result may create the review-lane child link.
 *
 * @param sessionID Parent Orchestrator session.
 * @param callID Task call that reserved the lane attempt.
 * @param childSessionId Child session reported by that exact Task result.
 * @returns Nothing; an unknown call or conflicting child link is ignored.
 */
export function linkReviewLaneChild(
    sessionID: string,
    callID: string,
    childSessionId: string,
): void {
    const ref = dispatchByCall.get(callKeyFor(sessionID, callID));
    if (!ref) return;
    const existing = dispatchByChild.get(childSessionId);
    if (existing && !sameAttempt(existing, ref)) return;
    ref.childSessionId = childSessionId;
    dispatchByChild.set(childSessionId, ref);
}

/**
 * Resolve a lane attempt from a child event only after its call link exists.
 *
 * @param childSessionId Child session ID from a host lifecycle event.
 * @param state Terminal execution result to apply to the correlated lane.
 * @returns Nothing; an unknown or stale child link is ignored.
 */
export function markReviewLaneChildTerminal(
    childSessionId: string,
    state: "completed" | "failed",
): void {
    const ref = dispatchByChild.get(childSessionId);
    if (ref) finishAttempt(ref, state);
}

/**
 * Invalidate one round and remove all of its stale call/child associations.
 *
 * @param sessionID Orchestrator session whose active round is discarded.
 * @returns Nothing; sessions without a round are left unchanged.
 */
export function invalidateReviewLaneRound(sessionID: string): void {
    const round = rounds.get(sessionID);
    if (!round) return;
    removeRoundDispatches(sessionID, round.roundId);
    rounds.delete(sessionID);
}

/** Clear rounds, task associations, and generated identities for test isolation. */
export function __resetReviewLanesForTesting(): void {
    rounds.clear();
    dispatchByCall.clear();
    dispatchByChild.clear();
    nextRoundIdentity = 0;
}

/** Apply a terminal result only when it still belongs to the lane's active attempt.
 *
 * @param ref Exact call/round/lane/attempt captured at reservation time.
 * @param state Execution result to record.
 * @returns Nothing; stale or superseded attempts cannot mutate the current lane.
 */
function finishAttempt(ref: DispatchRef, state: "completed" | "failed"): void {
    const round = rounds.get(ref.sessionID);
    const lane = round?.roundId === ref.roundId ? round.lanes.get(ref.laneId) : undefined;
    if (
        !lane ||
        lane.state !== "inFlight" ||
        lane.activeCallId !== ref.callID ||
        lane.attempts !== ref.attempt
    ) {
        return;
    }
    lane.state = state;
    lane.activeCallId = undefined;
    dispatchByCall.delete(callKeyFor(ref.sessionID, ref.callID));
    if (ref.childSessionId !== undefined && dispatchByChild.get(ref.childSessionId) === ref) {
        dispatchByChild.delete(ref.childSessionId);
    }
}

/** Resolve and validate the active round token for a session operation.
 *
 * @param sessionID Orchestrator session to inspect.
 * @param roundId Caller-supplied ephemeral round identity.
 * @returns The matching active round.
 * @throws When no round is active or the supplied identity is stale.
 */
function requireRound(sessionID: string, roundId: string): ReviewRound {
    const round = rounds.get(sessionID);
    if (!round) throw new Error(`No active review round for session '${sessionID}'`);
    if (round.roundId !== roundId) {
        throw new Error(`Stale review round '${roundId}'; active round is '${round.roundId}'`);
    }
    return round;
}

/** Remove call and child-event associations owned by one discarded round.
 *
 * @param sessionID Orchestrator session that owns the round.
 * @param roundId Round identity whose event associations should be removed.
 */
function removeRoundDispatches(sessionID: string, roundId: string): void {
    for (const [key, ref] of dispatchByCall) {
        if (ref.sessionID === sessionID && ref.roundId === roundId) dispatchByCall.delete(key);
    }
    for (const [childId, ref] of dispatchByChild) {
        if (ref.sessionID === sessionID && ref.roundId === roundId) dispatchByChild.delete(childId);
    }
}

/** Count only lanes that currently consume review-lane capacity.
 *
 * @param round Active round whose lane states are counted.
 * @returns Number of in-flight lanes.
 */
function countInFlight(round: ReviewRound): number {
    let count = 0;
    for (const lane of round.lanes.values()) if (lane.state === "inFlight") count += 1;
    return count;
}

/** Build a detached, ordered projection of runtime-owned round state.
 *
 * @param round Internal round to project.
 * @returns Lane definitions, execution states, counts, and fan-in completeness.
 */
function toSnapshot(round: ReviewRound): ReviewLaneRoundSnapshot {
    const counts = { pending: 0, inFlight: 0, completed: 0, failed: 0 };
    const lanes = [...round.lanes.values()].map(({ definition, state, attempts }) => {
        counts[state] += 1;
        return {
            ...definition,
            ...(definition.capabilityHints === undefined
                ? {}
                : { capabilityHints: [...definition.capabilityHints] }),
            state,
            attempts,
        };
    });
    return {
        active: true,
        roundId: round.roundId,
        change: round.change,
        lanes,
        counts,
        fanInComplete: counts.completed === lanes.length,
    };
}

/** Build a collision-safe in-memory key for one session-scoped Task call.
 *
 * @param sessionID Parent Orchestrator session.
 * @param callID Host Task call identity.
 * @returns Composite key used by the call association map.
 */
function callKeyFor(sessionID: string, callID: string): string {
    return `${sessionID}\u0000${callID}`;
}

/** Whether two child-link records refer to the same reserved lane attempt.
 *
 * @param left First dispatch association.
 * @param right Second dispatch association.
 * @returns True only when session, round, lane, and attempt all match.
 */
function sameAttempt(left: DispatchRef, right: DispatchRef): boolean {
    return (
        left.sessionID === right.sessionID &&
        left.roundId === right.roundId &&
        left.laneId === right.laneId &&
        left.attempt === right.attempt
    );
}
