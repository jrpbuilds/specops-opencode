import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createImplementerDispatchGate } from "../../src/host/dispatch-gate.js";
import {
    __resetParallelProgressForTesting,
    recordTaskDispatch,
    recordTaskResult,
    snapshotActiveImplementers,
} from "../../src/host/parallel-progress.js";
import {
    __resetSessionBindingsForTesting,
    recordSessionBinding,
} from "../../src/host/session-bindings.js";
import type { NormalizedApplyInstructionContext } from "../../src/openspec/apply-instructions.js";
import type { ApplyInstructionsResult } from "../../src/openspec/apply-instructions.js";
import {
    DEFAULT_AUTO_REVIEW_ITERATIONS,
    DEFAULT_IMPLEMENTER_FANOUT,
    DEFAULT_REVIEW_FANOUT,
    type SpecOpsConfig,
} from "../../src/config.js";
import { AGENT_IDS } from "../../src/agents/ids.js";

const COORDINATOR = "ses_coordinator";
const DIRECTORY = "/project";

function makeConfig(maxSubagentConcurrency: number): SpecOpsConfig {
    const agents = Object.fromEntries(
        Object.values(AGENT_IDS).map(id => [id, {}]),
    ) as SpecOpsConfig["agents"];
    return {
        agents,
        frontierEscalation: false,
        maxSubagentConcurrency,
        maxAutoReviewIterations: DEFAULT_AUTO_REVIEW_ITERATIONS,
        implementerFanout: DEFAULT_IMPLEMENTER_FANOUT,
        reviewFanout: DEFAULT_REVIEW_FANOUT,
    };
}

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

/** Durable-read stub with a call log and a swappable failure/fixture mode. */
function makeDurableReader(tasks: readonly { id: string; done: boolean }[] | string) {
    const reads: { change: string; cwd: string }[] = [];
    const getApplyInstructions = async (
        change: string,
        cwd: string,
    ): Promise<ApplyInstructionsResult> => {
        reads.push({ change, cwd });
        if (typeof tasks === "string") return { ok: false, error: tasks };
        return { ok: true, context: fakeApplyContext(tasks) };
    };
    return { reads, getApplyInstructions };
}

/** Durable-read stub held open so concurrently started gates can be interleaved. */
function makeDeferredDurableReader(tasks: readonly { id: string; done: boolean }[]) {
    const reads: { change: string; cwd: string }[] = [];
    let release!: () => void;
    const ready = new Promise<void>(resolve => {
        release = resolve;
    });
    const getApplyInstructions = async (
        change: string,
        cwd: string,
    ): Promise<ApplyInstructionsResult> => {
        reads.push({ change, cwd });
        await ready;
        return { ok: true, context: fakeApplyContext(tasks) };
    };
    return { reads, release, getApplyInstructions };
}

type GateHook = ReturnType<typeof createImplementerDispatchGate>;

/** Fire the gate for one implementer dispatch; a rejection rejects the promise. */
let nextCallID = 0;
async function dispatch(
    hook: GateHook,
    prompt?: string,
    subagentType?: string,
    callID = `gate-${++nextCallID}`,
): Promise<void> {
    await hook(
        { tool: "task", sessionID: COORDINATOR, callID },
        { args: { subagent_type: subagentType ?? AGENT_IDS.implementer, prompt } },
    );
}

/** Complete a foreground dispatch after its before-hook was fired directly. */
async function completeForeground(callID: string): Promise<void> {
    await recordTaskResult(
        { tool: "task", sessionID: COORDINATOR, callID, args: {} },
        { title: "", output: "done", metadata: {} },
    );
}

/** Seed one in-flight implementer entry through the fail-open observer. */
async function seedInFlight(callID: string, prompt?: string): Promise<void> {
    await recordTaskDispatch(
        { tool: "task", sessionID: COORDINATOR, callID },
        {
            args: {
                subagent_type: AGENT_IDS.implementer,
                ...(prompt === undefined ? {} : { prompt }),
            },
        },
    );
}

function gateFor(tasks: readonly { id: string; done: boolean }[] | string, maxConcurrency = 2) {
    const durable = makeDurableReader(tasks);
    const hook = createImplementerDispatchGate({
        directory: DIRECTORY,
        getApplyInstructions: durable.getApplyInstructions,
        getConfig: () => makeConfig(maxConcurrency),
    });
    return { durable, hook };
}

/** Compose the gate and the recorder the way the plugin does, swallowing rejections. */
async function compose(hook: GateHook, callID: string, prompt?: string): Promise<boolean> {
    try {
        await hook(
            { tool: "task", sessionID: COORDINATOR, callID },
            { args: { subagent_type: AGENT_IDS.implementer, prompt } },
        );
    } catch {
        return false;
    }
    await recordTaskDispatch(
        { tool: "task", sessionID: COORDINATOR, callID },
        { args: { subagent_type: AGENT_IDS.implementer, prompt } },
    );
    return true;
}

const TASKS = [
    { id: "1.1", done: true },
    { id: "2.1", done: false },
    { id: "2.2", done: false },
];

beforeEach(() => {
    recordSessionBinding(COORDINATOR, "SpecOps", "example");
});

afterEach(() => {
    __resetParallelProgressForTesting();
    __resetSessionBindingsForTesting();
});

describe("implementer dispatch gate passthrough", () => {
    test("ignores non-task tools, unbound sessions, and non-implementer subagents", async () => {
        const { durable, hook } = gateFor(TASKS);

        await expect(
            hook({ tool: "todowrite", sessionID: COORDINATOR, callID: "c1" }, { args: {} }),
        ).resolves.toBeUndefined();
        await expect(
            dispatch(hook, "assignedTaskIds: 1.1", AGENT_IDS.reviewer),
        ).resolves.toBeUndefined();

        const unbound = createImplementerDispatchGate({
            directory: DIRECTORY,
            getApplyInstructions: durable.getApplyInstructions,
            getConfig: () => makeConfig(2),
        });
        __resetSessionBindingsForTesting();
        await expect(dispatch(unbound, "assignedTaskIds: 1.1")).resolves.toBeUndefined();

        expect(durable.reads).toEqual([]);
    });

    test("the whole-list serial path passes without a durable read", async () => {
        const { durable, hook } = gateFor(TASKS);

        await expect(
            dispatch(hook, "Implement the change; every unchecked task is yours.", undefined, "c1"),
        ).resolves.toBeUndefined();
        await completeForeground("c1");
        await expect(dispatch(hook, undefined, undefined, "c2")).resolves.toBeUndefined();

        expect(durable.reads).toEqual([]);
    });
});

describe("implementer dispatch gate rejections", () => {
    test("a whole-list dispatch is rejected against active implementers", async () => {
        const { durable, hook } = gateFor(TASKS);
        await seedInFlight("c1", "assignedTaskIds: 2.1");

        await expect(dispatch(hook, undefined)).rejects.toThrow(
            "Invalid implementer dispatch: the whole-list assignment overlaps 1 active implementer",
        );
        expect(durable.reads).toEqual([]);
    });

    test("a whole-list dispatch is rejected against an active whole-list implementer", async () => {
        const { durable, hook } = gateFor(TASKS);
        await seedInFlight("c1", undefined);

        await expect(dispatch(hook, "whole-list")).rejects.toThrow(
            "Invalid implementer dispatch: the whole-list assignment overlaps 1 active implementer",
        );
        expect(durable.reads).toEqual([]);
    });

    test("concurrency capacity is full before specialist work begins", async () => {
        const { durable, hook } = gateFor(TASKS, 2);
        await seedInFlight("c1", "assignedTaskIds: 2.1");
        await seedInFlight("c2", "assignedTaskIds: 2.2");

        await expect(dispatch(hook, "assignedTaskIds: 2.1")).rejects.toThrow(
            "Invalid implementer dispatch: concurrency capacity is full (2 of 2 implementer slots already in flight)",
        );
        expect(durable.reads).toEqual([]);
    });

    test("capacity applies to whole-list dispatches too", async () => {
        const { durable, hook } = gateFor(TASKS, 1);
        await seedInFlight("c1", "assignedTaskIds: 2.1");

        await expect(dispatch(hook, undefined)).rejects.toThrow(
            "Invalid implementer dispatch: concurrency capacity is full (1 of 1 implementer slots already in flight)",
        );
        expect(durable.reads).toEqual([]);
    });

    test("a scoped payload the parser cannot read is malformed, never whole-list", async () => {
        const { durable, hook } = gateFor(TASKS);

        await expect(dispatch(hook, "your assignedTaskIds are listed below")).rejects.toThrow(
            "Invalid implementer dispatch: malformed assignedTaskIds payload " +
                "(assignedTaskIds appears but no line matches 'assignedTaskIds: <id>, <id>'); " +
                "send the assignment as one line reading 'assignedTaskIds: <id>, <id>'",
        );
        expect(durable.reads).toEqual([]);
    });

    test("unknown ids are rejected against the fresh task list", async () => {
        const { durable, hook } = gateFor(TASKS);

        await expect(dispatch(hook, "assignedTaskIds: 9.9")).rejects.toThrow(
            "Invalid implementer dispatch: assigned task '9.9' does not exist in the current task list",
        );
        expect(durable.reads).toEqual([{ change: "example", cwd: DIRECTORY }]);
    });

    test("already-complete ids are rejected", async () => {
        const { durable, hook } = gateFor(TASKS);

        await expect(dispatch(hook, "assignedTaskIds: 1.1")).rejects.toThrow(
            "Invalid implementer dispatch: assigned task '1.1' is already complete",
        );
        expect(durable.reads).toEqual([{ change: "example", cwd: DIRECTORY }]);
    });

    test("assignments overlapping an active scoped sibling are rejected", async () => {
        const { durable, hook } = gateFor(TASKS);
        await seedInFlight("c1", "assignedTaskIds: 2.1");

        await expect(dispatch(hook, "assignedTaskIds: 2.1")).rejects.toThrow(
            "Invalid implementer dispatch: task '2.1' assigned to multiple dispatches (c1, #2)",
        );
        expect(durable.reads).toEqual([{ change: "example", cwd: DIRECTORY }]);
    });

    test("scoped assignments are rejected against an active whole-list implementer", async () => {
        const { durable, hook } = gateFor(TASKS);
        await seedInFlight("c1", undefined);

        await expect(dispatch(hook, "assignedTaskIds: 2.1")).rejects.toThrow(
            "Invalid implementer dispatch: task assignment overlaps active implementer " +
                "'c1', which holds the whole-list assignment",
        );
        expect(durable.reads).toEqual([]);
    });

    test("a durable read failure blocks a scoped dispatch with the read error", async () => {
        const { durable, hook } = gateFor("openspec failed");

        await expect(dispatch(hook, "assignedTaskIds: 2.1")).rejects.toThrow(
            "Invalid implementer dispatch: the current task list could not be read for " +
                "'example' (openspec failed)",
        );
        expect(durable.reads).toEqual([{ change: "example", cwd: DIRECTORY }]);
        expect(snapshotActiveImplementers(COORDINATOR)).toEqual({
            count: 0,
            assignments: [],
        });
    });

    test("a durable read failure never blocks the whole-list path", async () => {
        const { durable, hook } = gateFor("openspec failed");

        await expect(dispatch(hook, undefined)).resolves.toBeUndefined();
        expect(durable.reads).toEqual([]);
    });
});

describe("implementer dispatch gate composition", () => {
    test("a passing scoped dispatch is recorded as active ownership", async () => {
        const { hook } = gateFor(TASKS);

        await expect(compose(hook, "c1", "assignedTaskIds: 2.1")).resolves.toBe(true);
        expect(snapshotActiveImplementers(COORDINATOR)).toEqual({
            count: 1,
            assignments: [{ dispatchId: "c1", taskIds: ["2.1"] }],
        });
    });

    test("a rejected dispatch is never recorded", async () => {
        const { hook } = gateFor(TASKS);

        await expect(compose(hook, "c1", "assignedTaskIds: 9.9")).resolves.toBe(false);
        expect(snapshotActiveImplementers(COORDINATOR)).toEqual({ count: 0, assignments: [] });
    });

    test("valid serial then valid parallel flows through capacity and disjointness", async () => {
        const { hook } = gateFor(TASKS, 2);

        await expect(compose(hook, "c1", "assignedTaskIds: 2.1")).resolves.toBe(true);
        await expect(compose(hook, "c2", "assignedTaskIds: 2.2")).resolves.toBe(true);
        expect(snapshotActiveImplementers(COORDINATOR)).toEqual({
            count: 2,
            assignments: [
                { dispatchId: "c1", taskIds: ["2.1"] },
                { dispatchId: "c2", taskIds: ["2.2"] },
            ],
        });
    });
});

describe("implementer dispatch gate concurrency", () => {
    test("reserves ownership so a concurrent overlapping gate is rejected", async () => {
        const durable = makeDeferredDurableReader(TASKS);
        const hook = createImplementerDispatchGate({
            directory: DIRECTORY,
            getApplyInstructions: durable.getApplyInstructions,
            getConfig: () => makeConfig(2),
        });

        const first = compose(hook, "c1", "assignedTaskIds: 2.1");
        expect(durable.reads).toEqual([{ change: "example", cwd: DIRECTORY }]);

        const second = compose(hook, "c2", "assignedTaskIds: 2.1");
        expect(durable.reads).toEqual([
            { change: "example", cwd: DIRECTORY },
            { change: "example", cwd: DIRECTORY },
        ]);

        durable.release();
        expect(await Promise.all([first, second])).toEqual([true, false]);
        expect(snapshotActiveImplementers(COORDINATOR)).toEqual({
            count: 1,
            assignments: [{ dispatchId: "c1", taskIds: ["2.1"] }],
        });
    });

    test("counts a concurrent reservation against implementer capacity", async () => {
        const durable = makeDeferredDurableReader(TASKS);
        const hook = createImplementerDispatchGate({
            directory: DIRECTORY,
            getApplyInstructions: durable.getApplyInstructions,
            getConfig: () => makeConfig(1),
        });

        const first = compose(hook, "c1", "assignedTaskIds: 2.1");
        expect(durable.reads).toEqual([{ change: "example", cwd: DIRECTORY }]);

        const second = compose(hook, "c2", "assignedTaskIds: 2.2");
        expect(await second).toBe(false);
        expect(durable.reads).toEqual([{ change: "example", cwd: DIRECTORY }]);

        durable.release();
        expect(await first).toBe(true);
        expect(snapshotActiveImplementers(COORDINATOR)).toEqual({
            count: 1,
            assignments: [{ dispatchId: "c1", taskIds: ["2.1"] }],
        });
    });

    test("allows concurrent disjoint reservations within the capacity ceiling", async () => {
        const durable = makeDeferredDurableReader(TASKS);
        const hook = createImplementerDispatchGate({
            directory: DIRECTORY,
            getApplyInstructions: durable.getApplyInstructions,
            getConfig: () => makeConfig(2),
        });

        const first = compose(hook, "c1", "assignedTaskIds: 2.1");
        const second = compose(hook, "c2", "assignedTaskIds: 2.2");
        expect(durable.reads).toEqual([
            { change: "example", cwd: DIRECTORY },
            { change: "example", cwd: DIRECTORY },
        ]);

        durable.release();
        expect(await Promise.all([first, second])).toEqual([true, true]);
        expect(snapshotActiveImplementers(COORDINATOR)).toEqual({
            count: 2,
            assignments: [
                { dispatchId: "c1", taskIds: ["2.1"] },
                { dispatchId: "c2", taskIds: ["2.2"] },
            ],
        });
    });
});
