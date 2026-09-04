import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
    __resetParallelProgressForTesting,
    createSessionEventObserver,
    recordTaskDispatch,
    recordTaskResult,
    snapshotParallelProgress,
} from "../../src/host/parallel-progress.js";
import {
    __resetSessionBindingsForTesting,
    recordSessionBinding,
} from "../../src/host/session-bindings.js";
import { summarizeReviewFanout } from "../../src/coordinator/review-fanout.js";
import { AGENT_IDS } from "../../src/agents/ids.js";

const COORDINATOR = "ses_coordinator";

function beforeInput(callID: string) {
    return { tool: "task", sessionID: COORDINATOR, callID };
}

function afterInput(callID: string, args?: Record<string, unknown>) {
    return { tool: "task", sessionID: COORDINATOR, callID, args: args ?? {} };
}

/** Fire the tracker's before/after seams for one background dispatch. */
async function dispatchBackground(
    callID: string,
    subagentType: string,
    taskOutput: string,
): Promise<void> {
    await recordTaskDispatch(beforeInput(callID), { args: { subagent_type: subagentType } });
    await recordTaskResult(afterInput(callID, { background: true }), {
        title: "",
        output: taskOutput,
        metadata: {},
    });
}

type EventHookInput = Parameters<ReturnType<typeof createSessionEventObserver>>[0];

/** Feed one host event through the session event observer. */
async function observe(event: Record<string, unknown>): Promise<void> {
    await createSessionEventObserver()({ event } as unknown as EventHookInput);
}

beforeEach(() => {
    recordSessionBinding(COORDINATOR, "SpecOps", "example");
});

afterEach(() => {
    __resetParallelProgressForTesting();
    __resetSessionBindingsForTesting();
});

describe("parallel progress tracking", () => {
    test("ignores non-task tools, unbound sessions, and untracked subagents", async () => {
        await recordTaskDispatch(
            { tool: "todowrite", sessionID: COORDINATOR, callID: "c1" },
            {
                args: {},
            },
        );
        await recordTaskDispatch(
            { tool: "task", sessionID: "ses_other", callID: "c2" },
            {
                args: { subagent_type: AGENT_IDS.implementer },
            },
        );
        await recordTaskDispatch(beforeInput("c3"), { args: { subagent_type: "specops-planner" } });

        expect(snapshotParallelProgress(COORDINATOR)).toEqual({});
    });

    test("tracks a background implementer dispatch through its task id and completion", async () => {
        await dispatchBackground("c1", AGENT_IDS.implementer, '<task id="task-1" state="running">');
        expect(snapshotParallelProgress(COORDINATOR).implementerDispatches).toEqual([
            { dispatchId: "task-1", state: "inFlight" },
        ]);

        await observe({ type: "session.idle", properties: { sessionID: "task-1" } });
        expect(snapshotParallelProgress(COORDINATOR).implementerDispatches).toEqual([
            { dispatchId: "task-1", state: "completed" },
        ]);
    });

    test("session.error and session.deleted fail the linked dispatch", async () => {
        await dispatchBackground("c1", AGENT_IDS.implementer, '<task id="task-1" state="running">');
        await observe({ type: "session.error", properties: { sessionID: "task-1" } });
        expect(snapshotParallelProgress(COORDINATOR).implementerDispatches).toEqual([
            { dispatchId: "task-1", state: "failed" },
        ]);

        await dispatchBackground("c2", AGENT_IDS.implementer, '<task id="task-2" state="running">');
        await observe({ type: "session.deleted", properties: { info: { id: "task-2" } } });
        expect(snapshotParallelProgress(COORDINATOR).implementerDispatches).toEqual([
            { dispatchId: "task-1", state: "failed" },
            { dispatchId: "task-2", state: "failed" },
        ]);
    });

    test("a foreground implementer dispatch completes at its tool result", async () => {
        await recordTaskDispatch(beforeInput("c1"), {
            args: { subagent_type: AGENT_IDS.implementer },
        });
        await recordTaskResult(afterInput("c1"), { title: "", output: "done", metadata: {} });

        expect(snapshotParallelProgress(COORDINATOR).implementerDispatches).toEqual([
            { state: "completed" },
        ]);
    });

    test("session.created corroborates the child link when the envelope is unparseable", async () => {
        await dispatchBackground("c1", AGENT_IDS.implementer, "no envelope here");
        expect(snapshotParallelProgress(COORDINATOR).implementerDispatches).toEqual([
            { state: "inFlight" },
        ]);

        await observe({
            type: "session.created",
            properties: { info: { id: "task-1", parentID: COORDINATOR } },
        });
        await observe({ type: "session.idle", properties: { sessionID: "task-1" } });
        expect(snapshotParallelProgress(COORDINATOR).implementerDispatches).toEqual([
            { dispatchId: "task-1", state: "completed" },
        ]);
    });

    test("projects critic fan-out onto canonical lists that summarizeReviewFanout accepts", async () => {
        await dispatchBackground(
            "c1",
            "specops-review-correctness",
            '<task id="r1" state="running">',
        );
        await dispatchBackground("c2", "specops-review-risk", '<task id="r2" state="running">');
        await observe({ type: "session.idle", properties: { sessionID: "r1" } });

        const snapshot = snapshotParallelProgress(COORDINATOR);
        expect(snapshot.reviewFanout).toEqual({
            pending: ["quality"],
            inFlight: ["risk"],
            completed: ["correctness"],
            failed: [],
        });
        const summary = summarizeReviewFanout(snapshot.reviewFanout!);
        expect(summary.ok).toBe(true);
        if (summary.ok) {
            expect(summary.progress.counts).toEqual({
                pending: 1,
                inFlight: 1,
                completed: 1,
                failed: 0,
            });
        }
    });

    test("a critic failure is reflected and a re-dispatch starts a fresh round", async () => {
        await dispatchBackground("c1", "specops-review-risk", '<task id="r1" state="running">');
        await observe({ type: "session.error", properties: { sessionID: "r1" } });
        expect(snapshotParallelProgress(COORDINATOR).reviewFanout).toEqual({
            pending: ["correctness", "quality"],
            inFlight: [],
            completed: [],
            failed: ["risk"],
        });

        await dispatchBackground("c2", "specops-review-risk", '<task id="r2" state="running">');
        expect(snapshotParallelProgress(COORDINATOR).reviewFanout).toEqual({
            pending: ["correctness", "quality"],
            inFlight: ["risk"],
            completed: [],
            failed: [],
        });
    });

    test("refill after completion keeps both dispatches in dispatch order", async () => {
        await dispatchBackground("c1", AGENT_IDS.implementer, '<task id="task-1" state="running">');
        await observe({ type: "session.idle", properties: { sessionID: "task-1" } });
        await dispatchBackground("c2", AGENT_IDS.implementer, '<task id="task-2" state="running">');

        expect(snapshotParallelProgress(COORDINATOR).implementerDispatches).toEqual([
            { dispatchId: "task-1", state: "completed" },
            { dispatchId: "task-2", state: "inFlight" },
        ]);
    });

    test("a resumed dispatch relinks the prior child session and resolves independently", async () => {
        await dispatchBackground("c1", AGENT_IDS.implementer, '<task id="task-1" state="running">');
        await observe({ type: "session.idle", properties: { sessionID: "task-1" } });

        // Resume: a new dispatch reusing the prior session id as its task id.
        await dispatchBackground("c2", AGENT_IDS.implementer, '<task id="task-1" state="running">');
        expect(snapshotParallelProgress(COORDINATOR).implementerDispatches).toEqual([
            { dispatchId: "task-1", state: "completed" },
            { dispatchId: "task-1", state: "inFlight" },
        ]);

        await observe({ type: "session.idle", properties: { sessionID: "task-1" } });
        expect(snapshotParallelProgress(COORDINATOR).implementerDispatches).toEqual([
            { dispatchId: "task-1", state: "completed" },
            { dispatchId: "task-1", state: "completed" },
        ]);
    });

    test("implementer and critic tracking coexist within one run", async () => {
        await dispatchBackground("c1", AGENT_IDS.implementer, '<task id="task-1" state="running">');
        await dispatchBackground(
            "c2",
            "specops-review-correctness",
            '<task id="r1" state="running">',
        );

        const snapshot = snapshotParallelProgress(COORDINATOR);
        expect(snapshot.implementerDispatches).toEqual([
            { dispatchId: "task-1", state: "inFlight" },
        ]);
        expect(snapshot.reviewFanout).toEqual({
            pending: ["risk", "quality"],
            inFlight: ["correctness"],
            completed: [],
            failed: [],
        });
    });

    test("observation seams never throw on malformed input", async () => {
        await expect(
            recordTaskDispatch(
                { tool: "task", sessionID: COORDINATOR, callID: "c1" },
                undefined as never,
            ),
        ).resolves.toBeUndefined();
        await expect(
            recordTaskResult(afterInput("c1"), undefined as never),
        ).resolves.toBeUndefined();
        await expect(observe({ type: "session.idle" })).resolves.toBeUndefined();
        await expect(observe({ type: "message.updated", properties: {} })).resolves.toBeUndefined();
    });
});
