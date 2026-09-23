import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { AGENT_IDS } from "../../src/agents/ids.js";
import {
    DEFAULT_AUTO_REVIEW_ITERATIONS,
    DEFAULT_IMPLEMENTER_FANOUT,
    DEFAULT_REVIEW_FANOUT,
    type SpecOpsConfig,
} from "../../src/config.js";
import { createImplementerDispatchGate } from "../../src/host/dispatch-gate.js";
import {
    __resetParallelProgressForTesting,
    createSessionEventObserver,
    recordTaskDispatch,
    recordTaskResult,
    snapshotParallelProgress,
} from "../../src/host/parallel-progress.js";
import {
    clearReviewLaneRound,
    getReviewLaneRound,
    reserveReviewLaneDispatch,
    retryReviewLane,
    startReviewLaneRound,
} from "../../src/host/review-lanes.js";
import {
    __resetSessionBindingsForTesting,
    getSessionBinding,
    recordSessionBinding,
} from "../../src/host/session-bindings.js";
import type { ReviewLaneDefinition } from "../../src/orchestrator/review-lanes.js";

const SESSION = "ses_review_lanes";
const CHANGE = "example";

/** Build a focused process config with the requested specialist ceiling. */
function makeConfig(maxSubagentConcurrency: number): SpecOpsConfig {
    return {
        agents: {} as SpecOpsConfig["agents"],
        frontierEscalation: false,
        maxSubagentConcurrency,
        maxAutoReviewIterations: DEFAULT_AUTO_REVIEW_ITERATIONS,
        implementerFanout: DEFAULT_IMPLEMENTER_FANOUT,
        reviewFanout: DEFAULT_REVIEW_FANOUT,
    };
}

const lanes: readonly ReviewLaneDefinition[] = [
    { id: "C1", lens: "correctness", scope: "booking frontend" },
    { id: "C2", lens: "correctness", scope: "booking API" },
    { id: "R1", lens: "risk", scope: "authentication boundary" },
    { id: "R2", lens: "risk", scope: "database migration" },
    { id: "Q1", lens: "quality", scope: "cross-layer integration" },
];

type Gate = ReturnType<typeof createImplementerDispatchGate>;

/** Build the real dispatch gate against a dummy durable reader and config. */
function gateFor(maxConcurrency = 2): Gate {
    return createImplementerDispatchGate({
        directory: "/project",
        getApplyInstructions: async () => ({ ok: false, error: "unused" }),
        getConfig: () => makeConfig(maxConcurrency),
    });
}

/** Run the fail-closed gate followed by the runtime's task observer. */
async function dispatchLane(
    gate: Gate,
    roundId: string,
    lane: ReviewLaneDefinition,
    callID: string,
): Promise<void> {
    const subagentType = {
        correctness: AGENT_IDS.reviewCorrectness,
        risk: AGENT_IDS.reviewRisk,
        quality: AGENT_IDS.reviewQuality,
    }[lane.lens];
    const output = {
        args: {
            subagent_type: subagentType,
            prompt: [
                `changeName: ${CHANGE}`,
                `reviewRoundId: ${roundId}`,
                `reviewLaneId: ${lane.id}`,
                `reviewScope: ${lane.scope}`,
            ].join("\n"),
        },
    };
    const input = { tool: "task", sessionID: SESSION, callID };
    await gate(input, output);
    await recordTaskDispatch(input, output);
}

/** Deliver a successful foreground Task result to the runtime observers. */
async function finishForeground(callID: string): Promise<void> {
    await recordTaskResult(
        { tool: "task", sessionID: SESSION, callID, args: {} },
        { title: "", output: "review complete", metadata: {} },
    );
}

/** Dispatch one lane and attach the child's ID from its running envelope. */
async function dispatchBackground(
    gate: Gate,
    roundId: string,
    lane: ReviewLaneDefinition,
    callID: string,
    childId: string,
): Promise<void> {
    await dispatchLane(gate, roundId, lane, callID);
    await recordTaskResult(
        { tool: "task", sessionID: SESSION, callID, args: { background: true } },
        {
            title: "",
            output: `<task id="${childId}" state="running">`,
            metadata: {},
        },
    );
}

type EventHookInput = Parameters<ReturnType<typeof createSessionEventObserver>>[0];

/** Send one host session event through the composed runtime observer. */
async function observe(event: Record<string, unknown>): Promise<void> {
    await createSessionEventObserver()({ event } as unknown as EventHookInput);
}

beforeEach(() => {
    __resetSessionBindingsForTesting();
    __resetParallelProgressForTesting();
    recordSessionBinding(SESSION, "SpecOps", CHANGE);
});

afterEach(() => {
    __resetParallelProgressForTesting();
    __resetSessionBindingsForTesting();
});

describe("dynamic review lane runtime", () => {
    test("tracks expanded same-lens lanes, enforces capacity, and supports rolling refill", async () => {
        const round = startReviewLaneRound(SESSION, CHANGE, lanes);
        const gate = gateFor(2);

        const simultaneous = await Promise.allSettled(
            lanes
                .slice(0, 3)
                .map((lane, index) => dispatchLane(gate, round.roundId, lane, `call-${index + 1}`)),
        );
        expect(simultaneous.filter(result => result.status === "fulfilled")).toHaveLength(2);
        expect(
            (simultaneous.find(result => result.status === "rejected") as PromiseRejectedResult)
                .reason.message,
        ).toContain("capacity reached (2/2 in flight)");
        expect(getReviewLaneRound(SESSION, CHANGE)?.counts).toEqual({
            pending: 3,
            inFlight: 2,
            completed: 0,
            failed: 0,
        });

        await finishForeground("call-1");
        await dispatchLane(gate, round.roundId, lanes[2], "call-r1-refill");
        const snapshot = snapshotParallelProgress(SESSION);
        expect(snapshot.reviewLanes?.counts).toEqual({
            pending: 2,
            inFlight: 2,
            completed: 1,
            failed: 0,
        });
        expect(snapshot.reviewFanout).toBeUndefined();
        expect(snapshot.reviewLanes?.lanes.map(lane => lane.id)).toEqual([
            "C1",
            "C2",
            "R1",
            "R2",
            "Q1",
        ]);
    });

    test("records failed execution, supports explicit retry, and ignores stale child events", async () => {
        const round = startReviewLaneRound(SESSION, CHANGE, [lanes[0]]);
        const gate = gateFor(1);
        await dispatchBackground(gate, round.roundId, lanes[0], "attempt-1", "child-old");
        await observe({ type: "session.error", properties: { sessionID: "child-old" } });
        expect(getReviewLaneRound(SESSION, CHANGE)?.lanes[0].state).toBe("failed");
        expect(getReviewLaneRound(SESSION, CHANGE)?.fanInComplete).toBe(false);

        retryReviewLane(SESSION, round.roundId, lanes[0].id);
        await dispatchBackground(gate, round.roundId, lanes[0], "attempt-2", "child-new");
        await observe({ type: "session.idle", properties: { sessionID: "child-old" } });
        expect(getReviewLaneRound(SESSION, CHANGE)?.lanes[0].state).toBe("inFlight");

        await observe({ type: "session.idle", properties: { sessionID: "child-new" } });
        expect(getReviewLaneRound(SESSION, CHANGE)?.fanInComplete).toBe(true);
    });

    test("foreground error fails the lane and cannot satisfy Final Reviewer fan-in", async () => {
        const round = startReviewLaneRound(SESSION, CHANGE, [lanes[0]]);
        const gate = gateFor(1);
        await dispatchLane(gate, round.roundId, lanes[0], "foreground-error");
        await recordTaskResult(
            { tool: "task", sessionID: SESSION, callID: "foreground-error", args: {} },
            {
                title: "",
                output: '<task id="foreground-child" state="error">failed</task>',
                metadata: {},
            },
        );

        expect(getReviewLaneRound(SESSION, CHANGE)?.lanes[0].state).toBe("failed");
        expect(getReviewLaneRound(SESSION, CHANGE)?.fanInComplete).toBe(false);
        await expect(
            gate(
                { tool: "task", sessionID: SESSION, callID: "final-reviewer" },
                {
                    args: {
                        subagent_type: AGENT_IDS.reviewer,
                        prompt: `changeName: ${CHANGE}\nreviewRoundId: ${round.roundId}`,
                    },
                },
            ),
        ).rejects.toThrow("is not complete");
    });

    test("foreground running or unknown explicit Task states remain unresolved", async () => {
        for (const [index, taskState] of ["running", "cancelled"].entries()) {
            __resetSessionBindingsForTesting();
            __resetParallelProgressForTesting();
            recordSessionBinding(SESSION, "SpecOps", CHANGE);
            const round = startReviewLaneRound(SESSION, CHANGE, [lanes[0]]);
            const gate = gateFor(1);
            const callID = `foreground-unresolved-${index}`;
            await dispatchLane(gate, round.roundId, lanes[0], callID);
            await recordTaskResult(
                { tool: "task", sessionID: SESSION, callID, args: {} },
                {
                    title: "",
                    output: `<task id="unresolved-child-${index}" state="${taskState}">partial</task>`,
                    metadata: {},
                },
            );
            expect(getReviewLaneRound(SESSION, CHANGE)?.lanes[0].state).toBe("inFlight");
        }
    });

    test("prevents round replacement while busy and rejects late events after a fresh round", async () => {
        const first = startReviewLaneRound(SESSION, CHANGE, [lanes[0]]);
        const gate = gateFor(1);
        await dispatchBackground(gate, first.roundId, lanes[0], "first-call", "first-child");
        expect(() => startReviewLaneRound(SESSION, CHANGE, [lanes[0]])).toThrow(
            "while review lanes are in flight",
        );

        await observe({ type: "session.idle", properties: { sessionID: "first-child" } });
        const second = startReviewLaneRound(SESSION, CHANGE, [lanes[0]]);
        expect(second.roundId).not.toBe(first.roundId);
        await observe({ type: "session.error", properties: { sessionID: "first-child" } });
        expect(getReviewLaneRound(SESSION, CHANGE)?.roundId).toBe(second.roundId);
        expect(getReviewLaneRound(SESSION, CHANGE)?.lanes[0].state).toBe("pending");
    });

    test("invalid lane identity, lens, scope, stale rounds, and early Reviewer fan-in fail closed", async () => {
        const round = startReviewLaneRound(SESSION, CHANGE, [lanes[0]]);
        const gate = gateFor(2);
        const wrongLens = { ...lanes[0], lens: "risk" as const };
        await expect(dispatchLane(gate, round.roundId, wrongLens, "wrong-lens")).rejects.toThrow(
            "uses lens 'correctness', not 'risk'",
        );

        const alteredScope = { ...lanes[0], scope: "different scope" };
        await expect(
            dispatchLane(gate, round.roundId, alteredScope, "wrong-scope"),
        ).rejects.toThrow("scope does not match its registered scope");
        await expect(dispatchLane(gate, "stale-round", lanes[0], "stale")).rejects.toThrow(
            "Stale review round",
        );

        const reviewerPrompt = `changeName: ${CHANGE}`;
        await expect(
            gate(
                { tool: "task", sessionID: SESSION, callID: "early-reviewer" },
                { args: { subagent_type: AGENT_IDS.reviewer, prompt: reviewerPrompt } },
            ),
        ).rejects.toThrow("must carry reviewRoundId");
    });

    test("Final Reviewer waits for complete fan-in while direct review needs no lane plan", async () => {
        const round = startReviewLaneRound(SESSION, CHANGE, [lanes[0]]);
        const gate = gateFor(1);
        await dispatchLane(gate, round.roundId, lanes[0], "critic");
        const reviewerInput = { tool: "task", sessionID: SESSION, callID: "reviewer" };
        await expect(
            gate(reviewerInput, {
                args: {
                    subagent_type: AGENT_IDS.reviewer,
                    prompt: `changeName: ${CHANGE}\nreviewRoundId: ${round.roundId}`,
                },
            }),
        ).rejects.toThrow("is not complete");

        await finishForeground("critic");
        await gate(reviewerInput, {
            args: {
                subagent_type: AGENT_IDS.reviewer,
                prompt: `changeName: ${CHANGE}\nreviewRoundId: ${round.roundId}`,
            },
        });

        // Clearing a terminal round restores the existing direct-review route.
        clearReviewLaneRound(SESSION, round.roundId);
        await gate(
            { tool: "task", sessionID: SESSION, callID: "direct-reviewer" },
            {
                args: {
                    subagent_type: AGENT_IDS.reviewer,
                    prompt: `changeName: ${CHANGE}`,
                },
            },
        );
    });

    test("does not guess child correlation when multiple same-lens lanes are unlinked", async () => {
        const round = startReviewLaneRound(SESSION, CHANGE, lanes.slice(0, 2));
        const gate = gateFor(2);
        await dispatchLane(gate, round.roundId, lanes[0], "unknown-child-1");
        await dispatchLane(gate, round.roundId, lanes[1], "unknown-child-2");
        await recordTaskResult(
            {
                tool: "task",
                sessionID: SESSION,
                callID: "unknown-child-1",
                args: { background: true },
            },
            { title: "", output: "no task envelope", metadata: {} },
        );
        await recordTaskResult(
            {
                tool: "task",
                sessionID: SESSION,
                callID: "unknown-child-2",
                args: { background: true },
            },
            { title: "", output: "no task envelope", metadata: {} },
        );

        await observe({
            type: "session.created",
            properties: { info: { id: "unattributed-child", parentID: SESSION } },
        });
        await observe({ type: "session.idle", properties: { sessionID: "unattributed-child" } });
        expect(getReviewLaneRound(SESSION, CHANGE)?.counts).toEqual({
            pending: 0,
            inFlight: 2,
            completed: 0,
            failed: 0,
        });
    });

    test("an unrelated child event cannot complete the sole unlinked review lane", async () => {
        const round = startReviewLaneRound(SESSION, CHANGE, [lanes[0]]);
        const gate = gateFor(1);
        await dispatchLane(gate, round.roundId, lanes[0], "unlinked-review");
        await recordTaskResult(
            {
                tool: "task",
                sessionID: SESSION,
                callID: "unlinked-review",
                args: { background: true },
            },
            { title: "", output: "no task envelope", metadata: {} },
        );

        await observe({
            type: "session.created",
            properties: { info: { id: "unrelated-child", parentID: SESSION } },
        });
        await observe({ type: "session.idle", properties: { sessionID: "unrelated-child" } });
        expect(getReviewLaneRound(SESSION, CHANGE)?.lanes[0].state).toBe("inFlight");
        expect(getReviewLaneRound(SESSION, CHANGE)?.fanInComplete).toBe(false);
    });

    test("invalidates the old review plan when the session changes active change", () => {
        startReviewLaneRound(SESSION, CHANGE, [lanes[0]]);
        recordSessionBinding(SESSION, "SpecOps", "another-change");
        expect(getReviewLaneRound(SESSION, "another-change")).toBeUndefined();
    });

    test("rejects a change switch while lanes run, then starts fresh after they terminate", async () => {
        const oldRound = startReviewLaneRound(SESSION, CHANGE, [lanes[0]]);
        const gate = gateFor(1);
        await dispatchBackground(gate, oldRound.roundId, lanes[0], "old-call", "old-child");

        expect(() => recordSessionBinding(SESSION, "SpecOps", "another-change")).toThrow(
            "while 1 review lane(s) are in flight",
        );
        expect(getSessionBinding(SESSION)?.change).toBe(CHANGE);
        expect(getReviewLaneRound(SESSION, CHANGE)?.lanes[0].state).toBe("inFlight");

        await observe({ type: "session.idle", properties: { sessionID: "old-child" } });
        recordSessionBinding(SESSION, "SpecOps", "another-change");
        const newRound = startReviewLaneRound(SESSION, "another-change", [lanes[0]]);
        expect(getReviewLaneRound(SESSION, "another-change")?.roundId).toBe(newRound.roundId);
        await observe({ type: "session.error", properties: { sessionID: "old-child" } });
        expect(getReviewLaneRound(SESSION, "another-change")?.lanes[0].state).toBe("pending");
    });

    test("rejects replacement while an old round is active even without a previous binding", async () => {
        __resetSessionBindingsForTesting();
        const round = startReviewLaneRound(SESSION, CHANGE, [lanes[0]]);
        reserveReviewLaneDispatch({
            sessionID: SESSION,
            callID: "unbound-switch",
            change: CHANGE,
            roundId: round.roundId,
            laneId: lanes[0].id,
            lens: lanes[0].lens,
            scope: lanes[0].scope,
            maxConcurrency: 1,
        });

        expect(() => recordSessionBinding(SESSION, "SpecOps", "another-change")).toThrow(
            "while 1 review lane(s) are in flight",
        );
        expect(getSessionBinding(SESSION)).toBeUndefined();
        expect(getReviewLaneRound(SESSION, CHANGE)?.lanes[0].state).toBe("inFlight");
    });

    test("a mismatched read does not discard a round for its owning change", () => {
        const round = startReviewLaneRound(SESSION, CHANGE, [lanes[0]]);

        expect(getReviewLaneRound(SESSION, "another-change")).toBeUndefined();
        expect(getReviewLaneRound(SESSION, CHANGE)?.roundId).toBe(round.roundId);
    });
});
