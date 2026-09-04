import type { ToolContext } from "@opencode-ai/plugin/tool";
import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import * as applyInstructions from "../../src/openspec/apply-instructions.js";
import type { NormalizedApplyInstructionContext } from "../../src/openspec/apply-instructions.js";
import { progressTool } from "../../src/host/tools/progress.js";
import { progress } from "../../src/tools/progress.js";
import {
    __resetParallelProgressForTesting,
    createSessionEventObserver,
    recordTaskDispatch,
    recordTaskResult,
} from "../../src/host/parallel-progress.js";
import {
    __resetSessionBindingsForTesting,
    recordSessionBinding,
} from "../../src/host/session-bindings.js";
import { AGENT_IDS } from "../../src/agents/ids.js";
import { stripTodoRefreshMarker } from "../helpers.js";

type AskRequest = Parameters<ToolContext["ask"]>[0];
type MetadataRequest = Parameters<ToolContext["metadata"]>[0];
type ProgressToolArgs = Parameters<typeof progressTool.execute>[0];

/** Build a minimal normalized apply-instruction context around a task list. */
const fakeApplyContext = (
    tasks: readonly { id: string; done: boolean }[],
): NormalizedApplyInstructionContext => ({
    changeName: "example",
    changeDir: "/openspec/changes/example",
    schemaName: "specops",
    contextFiles: {},
    progress: {
        total: tasks.length,
        complete: tasks.filter(task => task.done).length,
        remaining: tasks.filter(task => !task.done).length,
    },
    tasks: tasks.map(task => ({ ...task, description: `task ${task.id}` })),
    state: "ready",
    instruction: "apply the tasks",
});

// Plain (mutable) literal so the fixture matches the zod-inferred wrapper arg
// shape while remaining assignable to the core's readonly snapshot types.
const snapshot = {
    pending: ["quality"],
    inFlight: ["correctness"],
    completed: ["risk"],
    failed: [],
};

const assignments = [{ dispatchId: "impl-1", taskIds: ["1.1"] }];

function toolContext(ask: ToolContext["ask"], metadata: ToolContext["metadata"]): ToolContext {
    return {
        sessionID: "test-session",
        messageID: "test-message",
        agent: "SpecOps",
        directory: "/project",
        worktree: "/project",
        abort: new AbortController().signal,
        ask,
        metadata,
    };
}

function outputOf(result: Awaited<ReturnType<typeof progressTool.execute>>): string {
    const text = typeof result === "string" ? result : result.output;
    return stripTodoRefreshMarker(text);
}

afterEach(() => {
    mock.restore();
});

describe("specops_progress tool wrapper", () => {
    test("requests specops_progress permission exactly once before doing any work", async () => {
        const requests: AskRequest[] = [];
        const denial = new Error("lifecycle denied");
        const context = toolContext(
            async request => {
                requests.push(request);
                throw denial;
            },
            () => {
                throw new Error("work started before permission was granted");
            },
        );

        await expect(progressTool.execute({ change: "example" }, context)).rejects.toBe(denial);
        expect(requests).toEqual([
            {
                permission: "specops_lifecycle",
                patterns: ["specops_progress"],
                always: ["specops_progress"],
                metadata: { tool: "specops_progress" },
            },
        ]);
    });

    test("stops before metadata when lifecycle permission is denied", async () => {
        let metadataCalls = 0;
        const denial = new Error("lifecycle denied");
        const context = toolContext(
            async () => {
                throw denial;
            },
            () => {
                metadataCalls += 1;
            },
        );

        await expect(progressTool.execute({ change: "example" }, context)).rejects.toBe(denial);
        expect(metadataCalls).toBe(0);
    });

    test("emits the reading-parallel-progress metadata title after the grant", async () => {
        const metadataRequests: MetadataRequest[] = [];
        const context = toolContext(
            async () => {},
            metadata => {
                metadataRequests.push(metadata);
            },
        );

        // Fan-out-only call: the durable read is never touched, so no module
        // stubbing is needed to reach the core.
        await progressTool.execute({ change: "example", reviewFanout: snapshot }, context);

        expect(metadataRequests).toEqual([{ title: "Reading parallel progress…" }]);
    });

    test("passes the core's exact JSON string through with a stubbed durable read", async () => {
        const stubbed = spyOn(applyInstructions, "getApplyInstructions").mockImplementation(
            async () => ({
                ok: true,
                context: fakeApplyContext([{ id: "1.1", done: true }]),
            }),
        );
        const context = toolContext(
            async () => {},
            () => {},
        );

        const args: ProgressToolArgs = {
            change: "example",
            reviewFanout: snapshot,
            implementerAssignments: assignments,
        };
        const actual = outputOf(await progressTool.execute(args, context));
        const expected = await progress(args, {
            getApplyInstructions: change =>
                applyInstructions.getApplyInstructions(change, "/project"),
        });

        expect(stubbed).toHaveBeenCalledWith("example", "/project");
        expect(actual).toBe(expected);
        expect(JSON.parse(actual)).toEqual({
            change: "example",
            reviewFanout: {
                critics: [
                    { id: "correctness", status: "inFlight" },
                    { id: "risk", status: "completed" },
                    { id: "quality", status: "pending" },
                ],
                counts: { pending: 1, inFlight: 1, completed: 1, failed: 0 },
            },
            implementers: {
                available: true,
                dispatches: [
                    {
                        dispatchId: "impl-1",
                        assigned: ["1.1"],
                        durablyDone: ["1.1"],
                        durablyPending: [],
                        missingFromDurable: [],
                    },
                ],
                totals: {
                    dispatches: 1,
                    assignedTasks: 1,
                    durablyDone: 1,
                    durablyPending: 0,
                    missingFromDurable: 0,
                },
            },
        });
    });
});

describe("specops_progress runtime-derived report", () => {
    afterEach(() => {
        __resetParallelProgressForTesting();
        __resetSessionBindingsForTesting();
    });

    test("derives the ambient report from observed dispatches when no args are supplied", async () => {
        recordSessionBinding("test-session", "SpecOps", "example");
        // A background dispatch resolved through its task id and session idle.
        await recordTaskDispatch(
            { tool: "task", sessionID: "test-session", callID: "c1" },
            { args: { subagent_type: AGENT_IDS.implementer } },
        );
        await recordTaskResult(
            { tool: "task", sessionID: "test-session", callID: "c1", args: { background: true } },
            { title: "", output: '<task id="task-1" state="running">', metadata: {} },
        );
        await createSessionEventObserver()({
            event: { type: "session.idle", properties: { sessionID: "task-1" } },
        } as never);
        // A foreground dispatch still in flight.
        await recordTaskDispatch(
            { tool: "task", sessionID: "test-session", callID: "c2" },
            { args: { subagent_type: AGENT_IDS.implementer } },
        );
        const stubbed = spyOn(applyInstructions, "getApplyInstructions").mockImplementation(
            async () => ({
                ok: true,
                context: fakeApplyContext([{ id: "1.1", done: true }]),
            }),
        );
        const context = toolContext(
            async () => {},
            () => {},
        );

        const actual = outputOf(await progressTool.execute({ change: "example" }, context));

        expect(stubbed).toHaveBeenCalledWith("example", "/project");
        expect(JSON.parse(actual)).toEqual({
            change: "example",
            reviewFanout: { active: false },
            implementers: {
                available: true,
                dispatches: [{ dispatchId: "task-1", state: "completed" }, { state: "inFlight" }],
                durable: { total: 1, complete: 1, remaining: 0 },
            },
        });
    });

    test("derives an empty ambient report with durable counters when nothing is in flight", async () => {
        recordSessionBinding("test-session", "SpecOps", "example");
        spyOn(applyInstructions, "getApplyInstructions").mockImplementation(async () => ({
            ok: true,
            context: fakeApplyContext([
                { id: "1.1", done: true },
                { id: "1.2", done: false },
            ]),
        }));
        const context = toolContext(
            async () => {},
            () => {},
        );

        const actual = outputOf(await progressTool.execute({ change: "example" }, context));

        expect(JSON.parse(actual)).toEqual({
            change: "example",
            reviewFanout: { active: false },
            implementers: {
                available: true,
                dispatches: [],
                durable: { total: 2, complete: 1, remaining: 1 },
            },
        });
    });
});

describe("progress core runtime dispatch path", () => {
    test("rejects supplying both assignments and observed dispatches", async () => {
        const result = await progress(
            {
                change: "example",
                implementerAssignments: [{ dispatchId: "impl-1", taskIds: ["1.1"] }],
                implementerDispatches: [],
            },
            { getApplyInstructions: async () => ({ ok: false, error: "unused" }) },
        );

        expect(result).toBe(
            "Provide either implementerAssignments or implementerDispatches, not both.",
        );
    });

    test("a durable read failure degrades only the implementer view", async () => {
        const result = await progress(
            { change: "example", reviewFanout: snapshot, implementerDispatches: [] },
            { getApplyInstructions: async () => ({ ok: false, error: "openspec unavailable" }) },
        );

        expect(JSON.parse(result)).toEqual({
            change: "example",
            reviewFanout: {
                critics: [
                    { id: "correctness", status: "inFlight" },
                    { id: "risk", status: "completed" },
                    { id: "quality", status: "pending" },
                ],
                counts: { pending: 1, inFlight: 1, completed: 1, failed: 0 },
            },
            implementers: { available: false, error: "openspec unavailable" },
        });
    });

    test("keeps the zero-arg guidance when no view is requested at all", async () => {
        const result = await progress(
            { change: "example" },
            {
                getApplyInstructions: async () => ({ ok: false, error: "unused" }),
            },
        );

        expect(result).toBe(
            "Provide reviewFanout, implementerAssignments, or implementerDispatches to report parallel progress.",
        );
    });
});
