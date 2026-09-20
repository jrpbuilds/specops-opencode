import { describe, expect, test } from "bun:test";
import type { NormalizedApplyInstructionContext } from "../../src/openspec/apply-instructions.js";
import {
    parseAssignedTaskIds,
    projectImplementerAssignments,
    projectImplementerDispatches,
    validateImplementerCapacity,
    validateImplementerOwnership,
    validateImplementerDispatchScope,
    type ActiveImplementerAssignment,
    type ImplementerAssignment,
} from "../../src/orchestrator/implementer-progress.js";

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

describe("projectImplementerAssignments", () => {
    test("classifies assigned task ids against durable checkbox state", () => {
        const applyContext = fakeApplyContext([
            { id: "1.1", done: true },
            { id: "1.2", done: false },
        ]);
        const result = projectImplementerAssignments(
            [{ dispatchId: "impl-1", taskIds: ["1.1", "1.2"] }],
            applyContext,
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.progress.dispatches).toEqual([
            {
                dispatchId: "impl-1",
                assigned: ["1.1", "1.2"],
                durablyDone: ["1.1"],
                durablyPending: ["1.2"],
                missingFromDurable: [],
            },
        ]);
    });

    test("assigned-but-absent ids land in missingFromDurable, not pending", () => {
        const applyContext = fakeApplyContext([{ id: "1.1", done: false }]);
        const result = projectImplementerAssignments(
            [{ dispatchId: "impl-1", taskIds: ["9.9"] }],
            applyContext,
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.progress.dispatches[0]?.durablyPending).toEqual([]);
        expect(result.progress.dispatches[0]?.missingFromDurable).toEqual(["9.9"]);
        expect(result.progress.totals.missingFromDurable).toBe(1);
        expect(result.progress.totals.durablyPending).toBe(0);
    });

    test("preserves dispatch order and per-dispatch taskIds order", () => {
        const applyContext = fakeApplyContext([
            { id: "1.1", done: true },
            { id: "1.2", done: true },
            { id: "2.1", done: false },
        ]);
        const result = projectImplementerAssignments(
            [
                { dispatchId: "impl-2", taskIds: ["2.1", "1.2"] },
                { dispatchId: "impl-1", taskIds: ["1.1"] },
            ],
            applyContext,
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.progress.dispatches.map(dispatch => dispatch.dispatchId)).toEqual([
            "impl-2",
            "impl-1",
        ]);
        expect(result.progress.dispatches[0]?.assigned).toEqual(["2.1", "1.2"]);
        expect(result.progress.dispatches[0]?.durablyDone).toEqual(["1.2"]);
        expect(result.progress.dispatches[0]?.durablyPending).toEqual(["2.1"]);
    });

    test("computes totals across multiple dispatches", () => {
        const applyContext = fakeApplyContext([
            { id: "1.1", done: true },
            { id: "1.2", done: true },
            { id: "2.1", done: false },
            { id: "2.2", done: false },
        ]);
        const result = projectImplementerAssignments(
            [
                { dispatchId: "impl-1", taskIds: ["1.1", "1.2"] },
                { dispatchId: "impl-2", taskIds: ["2.1", "2.2", "9.9"] },
            ],
            applyContext,
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.progress.totals).toEqual({
            dispatches: 2,
            assignedTasks: 5,
            durablyDone: 2,
            durablyPending: 2,
            missingFromDurable: 1,
        });
    });

    test("omits dispatchId from the output when the input dispatch has none", () => {
        const result = projectImplementerAssignments([{ taskIds: ["1.1"] }], fakeApplyContext([]));

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(Object.hasOwn(result.progress.dispatches[0] ?? {}, "dispatchId")).toBe(false);
        expect(JSON.stringify(result.progress.dispatches[0])).not.toContain("dispatchId");
    });

    test("does not mutate its inputs", () => {
        const assignments: ImplementerAssignment[] = [{ dispatchId: "impl-1", taskIds: ["1.1"] }];
        const applyContext = fakeApplyContext([{ id: "1.1", done: true }]);

        projectImplementerAssignments(assignments, applyContext);

        expect(assignments).toEqual([{ dispatchId: "impl-1", taskIds: ["1.1"] }]);
        expect(applyContext.tasks).toEqual([{ id: "1.1", done: true, description: "task 1.1" }]);
    });

    test("rejects an empty taskIds list with the dispatch label", () => {
        const withId = projectImplementerAssignments(
            [{ dispatchId: "impl-1", taskIds: [] }],
            fakeApplyContext([]),
        );
        expect(withId.ok).toBe(false);
        if (withId.ok) return;
        expect(withId.error).toContain("impl-1");

        const withoutId = projectImplementerAssignments(
            [{ dispatchId: "impl-1", taskIds: ["1.1"] }, { taskIds: [] }],
            fakeApplyContext([{ id: "1.1", done: true }]),
        );
        expect(withoutId.ok).toBe(false);
        if (withoutId.ok) return;
        expect(withoutId.error).toContain("#2");
    });

    test("rejects a duplicate task id within one dispatch", () => {
        const result = projectImplementerAssignments(
            [{ dispatchId: "impl-1", taskIds: ["2.1", "2.1"] }],
            fakeApplyContext([]),
        );

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error).toContain("task '2.1'");
        expect(result.error).toContain("impl-1");
    });

    test("rejects a task id assigned to multiple dispatches", () => {
        const result = projectImplementerAssignments(
            [{ dispatchId: "impl-1", taskIds: ["T1", "T3"] }, { taskIds: ["T3", "T4"] }],
            fakeApplyContext([]),
        );

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error).toBe("task 'T3' assigned to multiple dispatches (impl-1, #2)");
    });

    test("reports unchecked durable state as durablyPending without enforcing it", () => {
        const result = projectImplementerAssignments(
            [{ dispatchId: "impl-1", taskIds: ["2.1"] }],
            fakeApplyContext([{ id: "2.1", done: false }]),
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.progress.dispatches[0]?.durablyPending).toEqual(["2.1"]);
        expect(result.progress.totals.durablyPending).toBe(1);
    });
});

describe("projectImplementerDispatches", () => {
    const applyContext = fakeApplyContext([
        { id: "1.1", done: true },
        { id: "1.2", done: false },
    ]);

    test("preserves observed dispatch states and reconciles the durable counters", () => {
        const result = projectImplementerDispatches(
            [
                { dispatchId: "task-1", state: "completed" },
                { state: "inFlight" },
                { dispatchId: "task-2", state: "failed" },
            ],
            applyContext,
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.progress.dispatches).toEqual([
            { dispatchId: "task-1", state: "completed" },
            { state: "inFlight" },
            { dispatchId: "task-2", state: "failed" },
        ]);
        expect(result.progress.durable).toEqual({ total: 2, complete: 1, remaining: 1 });
    });

    test("an empty dispatch list still reports the durable counters", () => {
        const result = projectImplementerDispatches([], applyContext);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.progress.dispatches).toEqual([]);
        expect(result.progress.durable).toEqual({ total: 2, complete: 1, remaining: 1 });
    });

    test("fails closed on an unknown dispatch state", () => {
        const result = projectImplementerDispatches(
            [{ dispatchId: "task-1", state: "unexpected" as never }],
            applyContext,
        );

        expect(result).toEqual({
            ok: false,
            error: "dispatch task-1 has an unknown state",
        });
    });

    test("labels a stateless dispatch by position in the error message", () => {
        const result = projectImplementerDispatches(
            [{ state: "inFlight" }, { state: "bogus" as never }],
            applyContext,
        );

        expect(result).toEqual({
            ok: false,
            error: "dispatch #2 has an unknown state",
        });
    });
});

describe("parseAssignedTaskIds", () => {
    test("whole-list prompts without the token parse as absent", () => {
        expect(parseAssignedTaskIds(undefined)).toEqual({ status: "absent" });
        expect(parseAssignedTaskIds("")).toEqual({ status: "absent" });
        expect(
            parseAssignedTaskIds("Implement the change; every unchecked task is yours."),
        ).toEqual({ status: "absent" });
    });

    test("the canonical line parses among surrounding prose, preserving id order", () => {
        const prompt = [
            "Goal: implement the approved change.",
            "Context: read apply instructions first.",
            "assignedTaskIds: 2.1, 1.2, T3",
            "Return the handoff envelope when done.",
        ].join("\n");

        expect(parseAssignedTaskIds(prompt)).toEqual({
            status: "present",
            taskIds: ["2.1", "1.2", "T3"],
        });
    });

    test("tolerates line-leading and line-trailing whitespace and extra separator spaces", () => {
        expect(parseAssignedTaskIds("   assignedTaskIds: 1.1   ")).toEqual({
            status: "present",
            taskIds: ["1.1"],
        });
        expect(parseAssignedTaskIds("assignedTaskIds: 1.1,  1.2")).toEqual({
            status: "present",
            taskIds: ["1.1", "1.2"],
        });
    });

    test("a single id parses", () => {
        expect(parseAssignedTaskIds("assignedTaskIds: T9")).toEqual({
            status: "present",
            taskIds: ["T9"],
        });
    });

    test("prose mentions of the token leave the whole-list path untouched", () => {
        expect(parseAssignedTaskIds("your assignedTaskIds are listed below")).toEqual({
            status: "absent",
        });
        expect(
            parseAssignedTaskIds(
                [
                    "Implement all approved tasks. Task descriptions follow.",
                    "- [ ] 1.2 Add the identity pre-step; the unscoped whole-list path",
                    "      that carries no assignedTaskIds stays untouched.",
                    "No scoped assignment is being made.",
                ].join("\n"),
            ),
        ).toEqual({ status: "absent" });
    });

    test("a line-initial token the parser cannot read is malformed, never reinterpreted as whole-list", () => {
        expect(parseAssignedTaskIds("assignedTaskIds = 1.1, 1.2")).toEqual({
            status: "malformed",
            reason: "assignedTaskIds appears but no line matches 'assignedTaskIds: <id>, <id>'",
        });
        expect(parseAssignedTaskIds("assignedTaskIds:")).toEqual({
            status: "malformed",
            reason: "assignedTaskIds appears but no line matches 'assignedTaskIds: <id>, <id>'",
        });
        expect(parseAssignedTaskIds("assignedTaskIds : 1.1")).toEqual({
            status: "malformed",
            reason: "assignedTaskIds appears but no line matches 'assignedTaskIds: <id>, <id>'",
        });
    });

    test("rejects multiple canonical lines, empty ids, and whitespace inside an id", () => {
        expect(parseAssignedTaskIds("assignedTaskIds: 1.1\nassignedTaskIds: 1.2")).toEqual({
            status: "malformed",
            reason: "multiple canonical assignedTaskIds lines",
        });
        expect(parseAssignedTaskIds("assignedTaskIds:   ")).toEqual({
            status: "malformed",
            reason: "assignedTaskIds appears but no line matches 'assignedTaskIds: <id>, <id>'",
        });
        expect(parseAssignedTaskIds("assignedTaskIds: ,")).toEqual({
            status: "malformed",
            reason: "empty id in the list",
        });
        expect(parseAssignedTaskIds("assignedTaskIds: 1.1, 1. 1")).toEqual({
            status: "malformed",
            reason: "id '1. 1' contains whitespace",
        });
    });
});

describe("validateImplementerCapacity", () => {
    test("accepts a dispatch while slots remain", () => {
        expect(validateImplementerCapacity({ activeCount: 0, maxConcurrency: 2 })).toEqual({
            ok: true,
        });
        expect(validateImplementerCapacity({ activeCount: 1, maxConcurrency: 2 })).toEqual({
            ok: true,
        });
    });

    test("rejects the dispatch that would exceed the ceiling", () => {
        expect(validateImplementerCapacity({ activeCount: 2, maxConcurrency: 2 })).toEqual({
            ok: false,
            invariant: "capacity",
            error:
                "Invalid implementer dispatch: concurrency capacity is full " +
                "(2 of 2 implementer slots already in flight)",
        });
        expect(validateImplementerCapacity({ activeCount: 1, maxConcurrency: 1 })).toEqual({
            ok: false,
            invariant: "capacity",
            error:
                "Invalid implementer dispatch: concurrency capacity is full " +
                "(1 of 1 implementer slots already in flight)",
        });
    });
});

describe("validateImplementerOwnership", () => {
    test("the whole-list serial path passes with empty ownership", () => {
        expect(validateImplementerOwnership({ taskIds: undefined, activeAssignments: [] })).toEqual(
            { ok: true },
        );
        expect(validateImplementerOwnership({ taskIds: ["1.1"], activeAssignments: [] })).toEqual({
            ok: true,
        });
    });

    test("a whole-list dispatch overlaps every active implementer", () => {
        const one: ActiveImplementerAssignment[] = [{ dispatchId: "impl-1", taskIds: ["1.1"] }];
        expect(
            validateImplementerOwnership({ taskIds: undefined, activeAssignments: one }),
        ).toEqual({
            ok: false,
            invariant: "ownership-overlap",
            error: "Invalid implementer dispatch: the whole-list assignment overlaps 1 active implementer",
        });

        const two: ActiveImplementerAssignment[] = [
            { dispatchId: "impl-1", taskIds: ["1.1"] },
            { dispatchId: "impl-2" },
        ];
        expect(
            validateImplementerOwnership({ taskIds: undefined, activeAssignments: two }),
        ).toEqual({
            ok: false,
            invariant: "ownership-overlap",
            error: "Invalid implementer dispatch: the whole-list assignment overlaps 2 active implementers",
        });
    });

    test("no scoped assignment is disjoint from an active whole-list implementer", () => {
        expect(
            validateImplementerOwnership({
                taskIds: ["1.1"],
                activeAssignments: [{ dispatchId: "impl-1" }],
            }),
        ).toEqual({
            ok: false,
            invariant: "ownership-overlap",
            error:
                "Invalid implementer dispatch: task assignment overlaps active implementer " +
                "'impl-1', which holds the whole-list assignment",
        });
    });
});

describe("validateImplementerDispatchScope", () => {
    const applyContext = fakeApplyContext([
        { id: "1.1", done: true },
        { id: "2.1", done: false },
        { id: "2.2", done: false },
    ]);

    test("valid serial and valid parallel assignments pass", () => {
        expect(
            validateImplementerDispatchScope({
                taskIds: ["2.1"],
                activeAssignments: [],
                applyContext,
            }),
        ).toEqual({ ok: true });

        expect(
            validateImplementerDispatchScope({
                taskIds: ["2.1"],
                activeAssignments: [{ dispatchId: "impl-1", taskIds: ["2.2"] }],
                applyContext,
            }),
        ).toEqual({ ok: true });
    });

    test("reuses the shared contract pass for empty, duplicate, and overlapping ids", () => {
        expect(
            validateImplementerDispatchScope({
                taskIds: [],
                activeAssignments: [],
                applyContext,
            }),
        ).toEqual({
            ok: false,
            invariant: "assignment-contract",
            error: "Invalid implementer dispatch: dispatch #1 has an empty taskIds list",
        });

        expect(
            validateImplementerDispatchScope({
                taskIds: ["2.1", "2.1"],
                activeAssignments: [],
                applyContext,
            }),
        ).toEqual({
            ok: false,
            invariant: "assignment-contract",
            error: "Invalid implementer dispatch: task '2.1' assigned multiple times in dispatch #1",
        });

        expect(
            validateImplementerDispatchScope({
                taskIds: ["2.1"],
                activeAssignments: [{ dispatchId: "impl-1", taskIds: ["2.1"] }],
                applyContext,
            }),
        ).toEqual({
            ok: false,
            invariant: "assignment-contract",
            error: "Invalid implementer dispatch: task '2.1' assigned to multiple dispatches (impl-1, #2)",
        });
    });

    test("rejects unknown ids against the fresh task list", () => {
        expect(
            validateImplementerDispatchScope({
                taskIds: ["9.9"],
                activeAssignments: [],
                applyContext,
            }),
        ).toEqual({
            ok: false,
            invariant: "unknown-task",
            error: "Invalid implementer dispatch: assigned task '9.9' does not exist in the current task list",
        });
        expect(
            validateImplementerDispatchScope({
                taskIds: ["9.9", "8.8"],
                activeAssignments: [],
                applyContext,
            }),
        ).toEqual({
            ok: false,
            invariant: "unknown-task",
            error: "Invalid implementer dispatch: assigned tasks '9.9', '8.8' do not exist in the current task list",
        });
    });

    test("rejects already-complete ids", () => {
        expect(
            validateImplementerDispatchScope({
                taskIds: ["1.1"],
                activeAssignments: [],
                applyContext,
            }),
        ).toEqual({
            ok: false,
            invariant: "complete-task",
            error: "Invalid implementer dispatch: assigned task '1.1' is already complete",
        });
        expect(
            validateImplementerDispatchScope({
                taskIds: ["1.1"],
                activeAssignments: [{ dispatchId: "impl-1", taskIds: ["1.1"] }],
                applyContext,
            }),
        ).toEqual({
            ok: false,
            invariant: "assignment-contract",
            error: "Invalid implementer dispatch: task '1.1' assigned to multiple dispatches (impl-1, #2)",
        });
    });

    test("unknown-task is checked before complete-task", () => {
        expect(
            validateImplementerDispatchScope({
                taskIds: ["1.1", "9.9"],
                activeAssignments: [],
                applyContext,
            }),
        ).toEqual({
            ok: false,
            invariant: "unknown-task",
            error: "Invalid implementer dispatch: assigned task '9.9' does not exist in the current task list",
        });
    });

    test("an active whole-list implementer blocks every scoped assignment", () => {
        expect(
            validateImplementerDispatchScope({
                taskIds: ["2.1"],
                activeAssignments: [{ dispatchId: "impl-1" }],
                applyContext,
            }),
        ).toEqual({
            ok: false,
            invariant: "ownership-overlap",
            error:
                "Invalid implementer dispatch: task assignment overlaps active implementer " +
                "'impl-1', which holds the whole-list assignment",
        });
    });

    test("a sibling's own mid-flight completion is never penalized", () => {
        expect(
            validateImplementerDispatchScope({
                taskIds: ["2.1"],
                activeAssignments: [{ dispatchId: "impl-1", taskIds: ["1.1"] }],
                applyContext,
            }),
        ).toEqual({ ok: true });
    });

    test("rejections never mutate their inputs", () => {
        const activeAssignments: ActiveImplementerAssignment[] = [
            { dispatchId: "impl-1", taskIds: ["2.2"] },
        ];
        const taskIds = ["2.1"];

        validateImplementerDispatchScope({ taskIds, activeAssignments, applyContext });
        validateImplementerDispatchScope({ taskIds: ["9.9"], activeAssignments, applyContext });

        expect(activeAssignments).toEqual([{ dispatchId: "impl-1", taskIds: ["2.2"] }]);
        expect(taskIds).toEqual(["2.1"]);
    });

    test("rejections never prescribe a replacement lane plan", () => {
        for (const taskIds of [["9.9"], ["1.1"], ["2.1", "2.1"]]) {
            const result = validateImplementerDispatchScope({
                taskIds,
                activeAssignments: [],
                applyContext,
            });
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).not.toMatch(/should|lane|group|instead|recommend/);
            }
        }
    });
});
