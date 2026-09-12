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
import { AGENT_IDS, SPECIALIST_AGENT_IDS } from "../../src/agents/ids.js";

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

/** Fire the gate for one specialist dispatch; a rejection rejects the promise. */
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
            dispatch(hook, "changeName: example", AGENT_IDS.reviewer),
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
            dispatch(
                hook,
                "changeName: example\nImplement the change; every unchecked task is yours.",
                undefined,
                "c1",
            ),
        ).resolves.toBeUndefined();
        await completeForeground("c1");
        await expect(
            dispatch(hook, "changeName: example", undefined, "c2"),
        ).resolves.toBeUndefined();

        expect(durable.reads).toEqual([]);
    });
});

describe("specialist dispatch identity", () => {
    test("every specialist role is rejected without a changeName line", async () => {
        const { durable, hook } = gateFor(TASKS);

        for (const role of SPECIALIST_AGENT_IDS) {
            await expect(dispatch(hook, "Do the assigned pass.", role)).rejects.toThrow(
                `Invalid ${role} dispatch: no change name`,
            );
        }
        expect(durable.reads).toEqual([]);
        expect(snapshotActiveImplementers(COORDINATOR)).toEqual({ count: 0, assignments: [] });
    });

    test("each non-implementer specialist passes with the matching change name, no durable read", async () => {
        const { durable, hook } = gateFor(TASKS);

        for (const role of SPECIALIST_AGENT_IDS) {
            if (role === AGENT_IDS.implementer) continue;
            await expect(
                dispatch(hook, "changeName: example\nDo the assigned pass.", role),
            ).resolves.toBeUndefined();
        }
        expect(durable.reads).toEqual([]);
    });

    test("a line-initial payload the parser cannot read is malformed", async () => {
        const { durable, hook } = gateFor(TASKS);

        await expect(dispatch(hook, "changeName = example", AGENT_IDS.reviewer)).rejects.toThrow(
            "Invalid specops-reviewer dispatch: malformed changeName payload " +
                "(changeName appears but no line matches 'changeName: <change>'); " +
                "send one line reading 'changeName: <change>'",
        );
        expect(durable.reads).toEqual([]);
    });

    test("a changeName naming another change is rejected", async () => {
        const { durable, hook } = gateFor(TASKS);

        await expect(
            dispatch(hook, "changeName: other-change", AGENT_IDS.reviewer),
        ).rejects.toThrow(
            "Invalid specops-reviewer dispatch: changeName 'other-change' does not match " +
                "the active change 'example'",
        );
        expect(durable.reads).toEqual([]);
    });

    test("a pasted template line reads as a different change, never as absent", async () => {
        const { durable, hook } = gateFor(TASKS);

        await expect(dispatch(hook, "changeName: <change>", AGENT_IDS.planner)).rejects.toThrow(
            "Invalid specops-planner dispatch: changeName '<change>' does not match " +
                "the active change 'example'",
        );
        expect(durable.reads).toEqual([]);
    });

    test("identity is checked before capacity and ownership", async () => {
        const { durable, hook } = gateFor(TASKS, 1);
        await seedInFlight("c1", "assignedTaskIds: 2.1");

        // Capacity is full, but the identity error is what surfaces.
        await expect(dispatch(hook, undefined)).rejects.toThrow(
            "Invalid specops-implementer dispatch: no change name",
        );
        expect(durable.reads).toEqual([]);
        expect(snapshotActiveImplementers(COORDINATOR)).toEqual({
            count: 1,
            assignments: [{ dispatchId: "c1", taskIds: ["2.1"] }],
        });
    });

    test("a resumed dispatch is validated against the current binding, not the old one", async () => {
        const { durable, hook } = gateFor(TASKS);

        recordSessionBinding(COORDINATOR, "SpecOps", "renamed-change");
        await expect(dispatch(hook, "changeName: example\nassignedTaskIds: 2.1")).rejects.toThrow(
            "Invalid specops-implementer dispatch: changeName 'example' does not match " +
                "the active change 'renamed-change'",
        );
        expect(durable.reads).toEqual([]);
    });

    test("mid-line prose mentions never satisfy the identity line", async () => {
        const { durable, hook } = gateFor(TASKS);

        await expect(
            dispatch(
                hook,
                [
                    "Implement the change. Remember: every dispatch carries changeName: <change>.",
                    "- [ ] 1.2 The envelope's changeName line is validated at the boundary.",
                ].join("\n"),
            ),
        ).rejects.toThrow("Invalid specops-implementer dispatch: no change name");
        expect(durable.reads).toEqual([]);
    });
});

describe("implementer dispatch gate rejections", () => {
    test("a whole-list dispatch is rejected against active implementers", async () => {
        const { durable, hook } = gateFor(TASKS);
        await seedInFlight("c1", "assignedTaskIds: 2.1");

        await expect(dispatch(hook, "changeName: example")).rejects.toThrow(
            "Invalid implementer dispatch: the whole-list assignment overlaps 1 active implementer",
        );
        expect(durable.reads).toEqual([]);
    });

    test("a whole-list dispatch is rejected against an active whole-list implementer", async () => {
        const { durable, hook } = gateFor(TASKS);
        await seedInFlight("c1", undefined);

        await expect(dispatch(hook, "changeName: example\nwhole-list")).rejects.toThrow(
            "Invalid implementer dispatch: the whole-list assignment overlaps 1 active implementer",
        );
        expect(durable.reads).toEqual([]);
    });

    test("concurrency capacity is full before specialist work begins", async () => {
        const { durable, hook } = gateFor(TASKS, 2);
        await seedInFlight("c1", "assignedTaskIds: 2.1");
        await seedInFlight("c2", "assignedTaskIds: 2.2");

        await expect(dispatch(hook, "changeName: example\nassignedTaskIds: 2.1")).rejects.toThrow(
            "Invalid implementer dispatch: concurrency capacity is full (2 of 2 implementer slots already in flight)",
        );
        expect(durable.reads).toEqual([]);
    });

    test("capacity applies to whole-list dispatches too", async () => {
        const { durable, hook } = gateFor(TASKS, 1);
        await seedInFlight("c1", "assignedTaskIds: 2.1");

        await expect(dispatch(hook, "changeName: example")).rejects.toThrow(
            "Invalid implementer dispatch: concurrency capacity is full (1 of 1 implementer slots already in flight)",
        );
        expect(durable.reads).toEqual([]);
    });

    test("a line-initial payload the parser cannot read is malformed, never whole-list", async () => {
        const { durable, hook } = gateFor(TASKS);

        await expect(
            dispatch(hook, "changeName: example\nassignedTaskIds = 1.1, 1.2"),
        ).rejects.toThrow(
            "Invalid implementer dispatch: malformed assignedTaskIds payload " +
                "(assignedTaskIds appears but no line matches 'assignedTaskIds: <id>, <id>'); " +
                "send the assignment as one line reading 'assignedTaskIds: <id>, <id>'",
        );
        expect(durable.reads).toEqual([]);
    });

    test("a whole-list prompt quoting task prose that mentions the tokens passes untouched", async () => {
        const { durable, hook } = gateFor(TASKS);

        await expect(
            dispatch(
                hook,
                [
                    "changeName: example",
                    "Implement all approved tasks. Task descriptions follow.",
                    "- [ ] 1.2 Add the identity pre-step; the unscoped whole-list path",
                    "      that carries no assignedTaskIds and only quotes changeName: <change>",
                    "      in prose stays untouched.",
                ].join("\n"),
            ),
        ).resolves.toBeUndefined();
        expect(durable.reads).toEqual([]);

        const snapshot = snapshotActiveImplementers(COORDINATOR);
        expect(snapshot.count).toBe(1);
        expect(snapshot.assignments[0]?.taskIds).toBeUndefined();
    });

    test("unknown ids are rejected against the fresh task list", async () => {
        const { durable, hook } = gateFor(TASKS);

        await expect(dispatch(hook, "changeName: example\nassignedTaskIds: 9.9")).rejects.toThrow(
            "Invalid implementer dispatch: assigned task '9.9' does not exist in the current task list",
        );
        expect(durable.reads).toEqual([{ change: "example", cwd: DIRECTORY }]);
    });

    test("already-complete ids are rejected", async () => {
        const { durable, hook } = gateFor(TASKS);

        await expect(dispatch(hook, "changeName: example\nassignedTaskIds: 1.1")).rejects.toThrow(
            "Invalid implementer dispatch: assigned task '1.1' is already complete",
        );
        expect(durable.reads).toEqual([{ change: "example", cwd: DIRECTORY }]);
    });

    test("assignments overlapping an active scoped sibling are rejected", async () => {
        const { durable, hook } = gateFor(TASKS);
        await seedInFlight("c1", "assignedTaskIds: 2.1");

        await expect(dispatch(hook, "changeName: example\nassignedTaskIds: 2.1")).rejects.toThrow(
            "Invalid implementer dispatch: task '2.1' assigned to multiple dispatches (c1, #2)",
        );
        expect(durable.reads).toEqual([{ change: "example", cwd: DIRECTORY }]);
    });

    test("scoped assignments are rejected against an active whole-list implementer", async () => {
        const { durable, hook } = gateFor(TASKS);
        await seedInFlight("c1", undefined);

        await expect(dispatch(hook, "changeName: example\nassignedTaskIds: 2.1")).rejects.toThrow(
            "Invalid implementer dispatch: task assignment overlaps active implementer " +
                "'c1', which holds the whole-list assignment",
        );
        expect(durable.reads).toEqual([]);
    });

    test("a durable read failure blocks a scoped dispatch with the read error", async () => {
        const { durable, hook } = gateFor("openspec failed");

        await expect(dispatch(hook, "changeName: example\nassignedTaskIds: 2.1")).rejects.toThrow(
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

        await expect(dispatch(hook, "changeName: example")).resolves.toBeUndefined();
        expect(durable.reads).toEqual([]);
    });
});

describe("implementer dispatch gate composition", () => {
    test("a passing scoped dispatch is recorded as active ownership", async () => {
        const { hook } = gateFor(TASKS);

        await expect(
            compose(hook, "c1", "changeName: example\nassignedTaskIds: 2.1"),
        ).resolves.toBe(true);
        expect(snapshotActiveImplementers(COORDINATOR)).toEqual({
            count: 1,
            assignments: [{ dispatchId: "c1", taskIds: ["2.1"] }],
        });
    });

    test("a rejected dispatch is never recorded", async () => {
        const { hook } = gateFor(TASKS);

        await expect(
            compose(hook, "c1", "changeName: example\nassignedTaskIds: 9.9"),
        ).resolves.toBe(false);
        expect(snapshotActiveImplementers(COORDINATOR)).toEqual({ count: 0, assignments: [] });
    });

    test("valid serial then valid parallel flows through capacity and disjointness", async () => {
        const { hook } = gateFor(TASKS, 2);

        await expect(
            compose(hook, "c1", "changeName: example\nassignedTaskIds: 2.1"),
        ).resolves.toBe(true);
        await expect(
            compose(hook, "c2", "changeName: example\nassignedTaskIds: 2.2"),
        ).resolves.toBe(true);
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

        const first = compose(hook, "c1", "changeName: example\nassignedTaskIds: 2.1");
        expect(durable.reads).toEqual([{ change: "example", cwd: DIRECTORY }]);

        const second = compose(hook, "c2", "changeName: example\nassignedTaskIds: 2.1");
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

        const first = compose(hook, "c1", "changeName: example\nassignedTaskIds: 2.1");
        expect(durable.reads).toEqual([{ change: "example", cwd: DIRECTORY }]);

        const second = compose(hook, "c2", "changeName: example\nassignedTaskIds: 2.2");
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

        const first = compose(hook, "c1", "changeName: example\nassignedTaskIds: 2.1");
        const second = compose(hook, "c2", "changeName: example\nassignedTaskIds: 2.2");
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
