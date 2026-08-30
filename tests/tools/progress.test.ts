import { describe, expect, test } from "bun:test";
import type { ImplementerAssignment } from "../../src/coordinator/implementer-progress.js";
import type { ReviewFanoutSnapshot } from "../../src/coordinator/review-fanout.js";
import type { NormalizedApplyInstructionContext } from "../../src/openspec/apply-instructions.js";
import { progress, type ProgressDeps } from "../../src/tools/progress.js";

const mixedSnapshot = (overrides: Partial<ReviewFanoutSnapshot> = {}): ReviewFanoutSnapshot => ({
    pending: ["quality"],
    inFlight: ["correctness"],
    completed: ["risk"],
    failed: [],
    ...overrides,
});

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

const successfulDeps = (overrides: Partial<ProgressDeps> = {}): ProgressDeps => ({
    getApplyInstructions: async () => ({ ok: true, context: fakeApplyContext([]) }),
    ...overrides,
});

const failingReadDeps = (overrides: Partial<ProgressDeps> = {}): ProgressDeps => ({
    getApplyInstructions: async () => ({ ok: false, error: "read failed" }),
    ...overrides,
});

describe("progress", () => {
    test("rejects an empty change name without invoking deps", async () => {
        let called = false;
        const result = await progress(
            { change: "  " },
            {
                getApplyInstructions: async () => {
                    called = true;
                    return { ok: false, error: "should not be called" };
                },
            },
        );

        expect(result).toBe("An OpenSpec change name is required.");
        expect(called).toBe(false);
    });

    test("returns a guidance string without invoking deps when neither view is present", async () => {
        let called = false;
        const result = await progress(
            { change: "example" },
            {
                getApplyInstructions: async () => {
                    called = true;
                    return { ok: false, error: "should not be called" };
                },
            },
        );

        expect(result).toBe(
            "Provide reviewFanout and/or implementerAssignments to report parallel progress.",
        );
        expect(called).toBe(false);
        expect(() => JSON.parse(result)).toThrow();
    });

    test("a fan-out-only call never invokes getApplyInstructions", async () => {
        let called = false;
        const result = await progress(
            { change: "example", reviewFanout: mixedSnapshot() },
            {
                getApplyInstructions: async () => {
                    called = true;
                    return { ok: false, error: "should not be called" };
                },
            },
        );

        expect(called).toBe(false);
        const report = JSON.parse(result);
        expect(report).toEqual({
            change: "example",
            reviewFanout: {
                critics: [
                    { id: "correctness", status: "inFlight" },
                    { id: "risk", status: "completed" },
                    { id: "quality", status: "pending" },
                ],
                counts: { pending: 1, inFlight: 1, completed: 1, failed: 0 },
            },
        });
        expect("implementers" in report).toBe(false);
    });

    test("returns byte-identical JSON across two identical calls", async () => {
        const assignments: readonly ImplementerAssignment[] = [
            { dispatchId: "impl-1", taskIds: ["1.1", "1.2"] },
        ];
        const args = {
            change: "example",
            reviewFanout: mixedSnapshot(),
            implementerAssignments: assignments,
        };
        const deps = successfulDeps({
            getApplyInstructions: async () => ({
                ok: true,
                context: fakeApplyContext([
                    { id: "1.1", done: true },
                    { id: "1.2", done: false },
                ]),
            }),
        });

        const first = await progress(args, deps);
        const second = await progress(args, deps);

        expect(first).toBe(second);
        expect(JSON.parse(first)).toEqual({
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
                        assigned: ["1.1", "1.2"],
                        durablyDone: ["1.1"],
                        durablyPending: ["1.2"],
                        missingFromDurable: [],
                    },
                ],
                totals: {
                    dispatches: 1,
                    assignedTasks: 2,
                    durablyDone: 1,
                    durablyPending: 1,
                    missingFromDurable: 0,
                },
            },
        });
    });

    test("rejects an unknown critic id with a failure prefix and no report", async () => {
        const result = await progress(
            { change: "example", reviewFanout: mixedSnapshot({ pending: ["security"] }) },
            failingReadDeps(),
        );

        expect(result).toBe(
            "Invalid review fan-out snapshot for 'example': unknown critic id 'security'",
        );
        expect(() => JSON.parse(result)).toThrow();
    });

    test("rejects an incomplete fan-out snapshot with the missing-lists failure prefix", async () => {
        let called = false;
        const result = await progress(
            {
                change: "example",
                // Spec scenario "Incomplete fan-out snapshot rejected": the
                // failed list omitted entirely while another is present.
                reviewFanout: { pending: [], inFlight: [], completed: ["risk"] },
            },
            {
                getApplyInstructions: async () => {
                    called = true;
                    return { ok: false, error: "should not be called" };
                },
            },
        );

        expect(result).toBe(
            "Invalid review fan-out snapshot for 'example': fan-out snapshot is missing state list(s): failed",
        );
        expect(called).toBe(false);
        expect(() => JSON.parse(result)).toThrow();
    });

    test("states no active fan-out explicitly when the snapshot is omitted", async () => {
        const result = await progress(
            { change: "example", implementerAssignments: [] },
            successfulDeps(),
        );

        const report = JSON.parse(result);
        expect(report.reviewFanout).toEqual({ active: false });
        expect("critics" in report.reviewFanout).toBe(false);
        expect("counts" in report.reviewFanout).toBe(false);
        expect(report.implementers).toEqual({
            available: true,
            dispatches: [],
            totals: {
                dispatches: 0,
                assignedTasks: 0,
                durablyDone: 0,
                durablyPending: 0,
                missingFromDurable: 0,
            },
        });
    });

    test("rejects malformed implementer assignments with a failure prefix and no report", async () => {
        const result = await progress(
            { change: "example", implementerAssignments: [{ taskIds: [] }] },
            successfulDeps(),
        );

        expect(result).toBe(
            "Invalid implementer assignments for 'example': dispatch #1 has an empty taskIds list",
        );
        expect(() => JSON.parse(result)).toThrow();
    });

    test("degrades only the implementer view when the durable read fails", async () => {
        const error = "OpenSpec instructions apply failed with exit code 1";
        const result = await progress(
            { change: "example", reviewFanout: mixedSnapshot(), implementerAssignments: [] },
            failingReadDeps({
                getApplyInstructions: async () => ({ ok: false, error }),
            }),
        );

        const report = JSON.parse(result);
        expect(report).toEqual({
            change: "example",
            reviewFanout: {
                critics: [
                    { id: "correctness", status: "inFlight" },
                    { id: "risk", status: "completed" },
                    { id: "quality", status: "pending" },
                ],
                counts: { pending: 1, inFlight: 1, completed: 1, failed: 0 },
            },
            implementers: { available: false, error },
        });
    });

    test("composes both views in one report with the fixed key order", async () => {
        const result = await progress(
            {
                change: "example",
                reviewFanout: mixedSnapshot(),
                implementerAssignments: [{ dispatchId: "impl-1", taskIds: ["1.1"] }],
            },
            successfulDeps({
                getApplyInstructions: async () => ({
                    ok: true,
                    context: fakeApplyContext([{ id: "1.1", done: true }]),
                }),
            }),
        );

        const report = JSON.parse(result);
        expect(Object.keys(report)).toEqual(["change", "reviewFanout", "implementers"]);
        expect(report.implementers.dispatches).toEqual([
            {
                dispatchId: "impl-1",
                assigned: ["1.1"],
                durablyDone: ["1.1"],
                durablyPending: [],
                missingFromDurable: [],
            },
        ]);
    });
});
