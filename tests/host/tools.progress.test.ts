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
    snapshotParallelProgress,
} from "../../src/host/parallel-progress.js";
import {
    __resetSessionBindingsForTesting,
    recordSessionBinding,
} from "../../src/host/session-bindings.js";
import { AGENT_IDS } from "../../src/agents/ids.js";
import { reserveReviewLaneDispatch, startReviewLaneRound } from "../../src/host/review-lanes.js";
import { stripTodoRefreshMarker } from "../helpers.js";

type AskRequest = Parameters<ToolContext["ask"]>[0];
type MetadataRequest = Parameters<ToolContext["metadata"]>[0];

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
    __resetParallelProgressForTesting();
    __resetSessionBindingsForTesting();
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
        spyOn(applyInstructions, "getApplyInstructions").mockImplementation(async () => ({
            ok: true,
            context: fakeApplyContext([]),
        }));
        const context = toolContext(
            async () => {},
            metadata => {
                metadataRequests.push(metadata);
            },
        );

        await progressTool.execute({ change: "example" }, context);

        expect(metadataRequests).toEqual([{ title: "Reading parallel progress…" }]);
    });

    test("passes the core's exact JSON string through for the runtime-derived report", async () => {
        recordSessionBinding("test-session", "SpecOps", "example");
        const round = startReviewLaneRound("test-session", "example", [
            { id: "C1", lens: "correctness", scope: "booking frontend" },
            { id: "C2", lens: "correctness", scope: "booking API" },
            { id: "R1", lens: "risk", scope: "authentication" },
        ]);
        reserveReviewLaneDispatch({
            sessionID: "test-session",
            callID: "c1",
            change: "example",
            roundId: round.roundId,
            laneId: "C1",
            scope: "booking frontend",
            lens: "correctness",
            maxConcurrency: 2,
        });
        await recordTaskDispatch(
            { tool: "task", sessionID: "test-session", callID: "c1" },
            {
                args: {
                    subagent_type: AGENT_IDS.reviewCorrectness,
                    prompt: `reviewRoundId: ${round.roundId}\nreviewLaneId: C1\nreviewScope: booking frontend`,
                },
            },
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

        // Mirror the wrapper's derivation exactly: the observed snapshot is
        // passed through verbatim, with the dispatch list kept ambient.
        const observed = snapshotParallelProgress("test-session");
        const expected = await progress(
            {
                change: "example",
                ...(observed.reviewLanes ? { reviewLanes: observed.reviewLanes } : {}),
                implementerDispatches: observed.implementerDispatches ?? [],
            },
            {
                getApplyInstructions: change =>
                    applyInstructions.getApplyInstructions(change, "/project"),
            },
        );

        expect(stubbed).toHaveBeenCalledWith("example", "/project");
        expect(actual).toBe(expected);
        expect(JSON.parse(actual)).toEqual({
            change: "example",
            reviewLanes: {
                roundId: round.roundId,
                lanes: [
                    {
                        id: "C1",
                        lens: "correctness",
                        scope: "booking frontend",
                        state: "inFlight",
                        attempts: 1,
                    },
                    {
                        id: "C2",
                        lens: "correctness",
                        scope: "booking API",
                        state: "pending",
                        attempts: 0,
                    },
                    {
                        id: "R1",
                        lens: "risk",
                        scope: "authentication",
                        state: "pending",
                        attempts: 0,
                    },
                ],
                counts: { pending: 2, inFlight: 1, completed: 0, failed: 0 },
                fanInComplete: false,
            },
            implementers: {
                available: true,
                dispatches: [],
                durable: { total: 1, complete: 1, remaining: 0 },
            },
        });
    });
});

describe("specops_progress runtime-derived report", () => {
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
            reviewLanes: { active: false },
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
            reviewLanes: { active: false },
            implementers: {
                available: true,
                dispatches: [],
                durable: { total: 2, complete: 1, remaining: 1 },
            },
        });
    });
});
