import { describe, expect, test } from "bun:test";
import type { ImplementerDispatchObservation } from "../../src/orchestrator/implementer-progress.js";
import type { ReviewLaneRoundSnapshot } from "../../src/orchestrator/review-lanes.js";
import type { NormalizedApplyInstructionContext } from "../../src/openspec/apply-instructions.js";
import { progress, type ProgressDeps } from "../../src/tools/progress.js";

const lanes = (overrides: Partial<ReviewLaneRoundSnapshot> = {}): ReviewLaneRoundSnapshot => ({
    active: true,
    roundId: "review-round-1",
    change: "example",
    lanes: [
        { id: "R1", lens: "risk", scope: "auth", state: "failed", attempts: 2 },
        { id: "C1", lens: "correctness", scope: "frontend", state: "inFlight", attempts: 1 },
        { id: "C2", lens: "correctness", scope: "API", state: "pending", attempts: 0 },
        { id: "Q1", lens: "quality", scope: "integration", state: "completed", attempts: 1 },
    ],
    counts: { pending: 1, inFlight: 1, completed: 1, failed: 1 },
    fanInComplete: false,
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

    test("direct review has no invented lanes or durable read", async () => {
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

        expect(JSON.parse(result)).toEqual({ change: "example", reviewLanes: { active: false } });
        expect(called).toBe(false);
    });

    test("reports every lane state, preserves same-lens identities, and avoids a review-only durable read", async () => {
        let called = false;
        const result = await progress(
            { change: "example", reviewLanes: lanes() },
            {
                getApplyInstructions: async () => {
                    called = true;
                    return { ok: false, error: "should not be called" };
                },
            },
        );

        expect(called).toBe(false);
        expect(JSON.parse(result)).toEqual({
            change: "example",
            reviewLanes: {
                roundId: "review-round-1",
                lanes: [
                    {
                        id: "C1",
                        lens: "correctness",
                        scope: "frontend",
                        state: "inFlight",
                        attempts: 1,
                    },
                    { id: "C2", lens: "correctness", scope: "API", state: "pending", attempts: 0 },
                    { id: "R1", lens: "risk", scope: "auth", state: "failed", attempts: 2 },
                    {
                        id: "Q1",
                        lens: "quality",
                        scope: "integration",
                        state: "completed",
                        attempts: 1,
                    },
                ],
                counts: { pending: 1, inFlight: 1, completed: 1, failed: 1 },
                fanInComplete: false,
            },
        });
    });

    test("returns byte-identical JSON and composes review with implementer progress", async () => {
        const args = {
            change: "example",
            reviewLanes: lanes(),
            implementerDispatches: [
                { dispatchId: "impl-1", state: "completed" },
                { state: "inFlight" },
            ] as readonly ImplementerDispatchObservation[],
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
        expect(first).toBe(await progress(args, deps));
        const report = JSON.parse(first);
        expect(Object.keys(report)).toEqual(["change", "reviewLanes", "implementers"]);
        expect(report.implementers).toEqual({
            available: true,
            dispatches: [{ dispatchId: "impl-1", state: "completed" }, { state: "inFlight" }],
            durable: { total: 2, complete: 1, remaining: 1 },
        });
    });

    test("rejects inconsistent review observations without a partial report or durable read", async () => {
        let called = false;
        const result = await progress(
            {
                change: "example",
                reviewLanes: lanes({
                    counts: { pending: 0, inFlight: 2, completed: 1, failed: 1 },
                }),
                implementerDispatches: [],
            },
            {
                getApplyInstructions: async () => {
                    called = true;
                    return { ok: false, error: "should not be called" };
                },
            },
        );

        expect(result).toBe(
            "Invalid review lane snapshot for 'example': review lane counts do not match execution states",
        );
        expect(() => JSON.parse(result)).toThrow();
        expect(called).toBe(false);
        expect(
            await progress({ change: "example", reviewLanes: null as never }, successfulDeps()),
        ).toBe(
            "Invalid review lane snapshot for 'example': review round has invalid identity or lanes",
        );
        expect(await progress({ change: "other", reviewLanes: lanes() }, successfulDeps())).toBe(
            "Invalid review lane snapshot for 'other': round belongs to another change",
        );
    });

    test("keeps review available when the durable implementer read fails", async () => {
        const result = await progress(
            { change: "example", reviewLanes: lanes(), implementerDispatches: [] },
            { getApplyInstructions: async () => ({ ok: false, error: "read failed" }) },
        );

        const report = JSON.parse(result);
        expect(report.reviewLanes.lanes).toHaveLength(4);
        expect(report.implementers).toEqual({ available: false, error: "read failed" });
    });

    test("rejects malformed implementer dispatches without a partial report", async () => {
        const result = await progress(
            {
                change: "example",
                implementerDispatches: [
                    { state: "collapsed" },
                ] as unknown as readonly ImplementerDispatchObservation[],
            },
            successfulDeps(),
        );

        expect(result).toBe(
            "Invalid implementer dispatches for 'example': dispatch #1 has an unknown state",
        );
        expect(() => JSON.parse(result)).toThrow();
    });
});
