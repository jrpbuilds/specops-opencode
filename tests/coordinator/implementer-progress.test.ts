import { describe, expect, test } from "bun:test";
import type { NormalizedApplyInstructionContext } from "../../src/openspec/apply-instructions.js";
import {
    projectImplementerAssignments,
    projectImplementerDispatches,
    type ImplementerAssignment,
} from "../../src/coordinator/implementer-progress.js";

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
