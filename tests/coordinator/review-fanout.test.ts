import { describe, expect, test } from "bun:test";
import { createReviewFanout, type ReviewCriticId } from "../../src/coordinator/review-fanout.js";

const report = (id: ReviewCriticId): string => `report for ${id}\nwith exact formatting`;

describe("createReviewFanout", () => {
    test("starts with all critics pending and no active work", () => {
        const fanout = createReviewFanout(2);

        expect(fanout.active).toBe(0);
        expect(fanout.available).toBe(2);
        expect(fanout.blocked).toBe(false);
        expect(fanout.pending).toEqual(["correctness", "risk", "quality"]);
        expect(fanout.inFlight).toEqual([]);
        expect(fanout.completed).toEqual([]);
        expect(fanout.failed).toEqual([]);
    });

    test("runs critics serially at concurrency one", () => {
        const fanout = createReviewFanout(1);

        expect(fanout.dispatch()).toEqual(["correctness"]);
        expect(fanout.dispatch()).toEqual([]);
        expect(fanout.complete("correctness", report("correctness"))).toBe(true);
        expect(fanout.dispatch()).toEqual(["risk"]);
        expect(fanout.complete("risk", report("risk"))).toBe(true);
        expect(fanout.dispatch()).toEqual(["quality"]);
        expect(fanout.complete("quality", report("quality"))).toBe(true);
        expect(fanout.allReportsCollected()).toBe(true);
    });

    test("refills a freed slot at concurrency two", () => {
        const fanout = createReviewFanout(2);

        expect(fanout.dispatch()).toEqual(["correctness", "risk"]);
        expect(fanout.active).toBe(2);
        expect(fanout.complete("correctness", report("correctness"))).toBe(true);
        expect(fanout.dispatch()).toEqual(["quality"]);
        expect(fanout.active).toBe(2);

        fanout.complete("risk", report("risk"));
        fanout.complete("quality", report("quality"));
        expect(fanout.allReportsCollected()).toBe(true);
    });

    test("dispatches all critics immediately when capacity is at least three", () => {
        const fanout = createReviewFanout(3);

        expect(fanout.dispatch()).toEqual(["correctness", "risk", "quality"]);
        expect(fanout.active).toBe(3);
        expect(fanout.available).toBe(0);
        expect(fanout.dispatch()).toEqual([]);
    });

    test("never exceeds the configured concurrency limit", () => {
        const fanout = createReviewFanout(2);

        expect(fanout.dispatch()).toHaveLength(2);
        expect(fanout.dispatch()).toEqual([]);
        expect(fanout.active).toBe(2);
        expect(fanout.available).toBe(0);
    });

    test("opens the fan-in gate only after every report completes", () => {
        const fanout = createReviewFanout(3);

        fanout.dispatch();
        expect(fanout.allReportsCollected()).toBe(false);
        fanout.complete("correctness", report("correctness"));
        expect(fanout.allReportsCollected()).toBe(false);
        fanout.complete("risk", report("risk"));
        expect(fanout.allReportsCollected()).toBe(false);
        fanout.complete("quality", report("quality"));
        expect(fanout.allReportsCollected()).toBe(true);
    });

    test("returns exact reports in stable critic order without consuming them", () => {
        const fanout = createReviewFanout(3);

        fanout.dispatch();
        fanout.complete("quality", report("quality"));
        fanout.complete("correctness", report("correctness"));
        fanout.complete("risk", report("risk"));

        const first = [...fanout.reports().entries()];
        const second = [...fanout.reports().entries()];
        expect(first).toEqual([
            ["correctness", report("correctness")],
            ["risk", report("risk")],
            ["quality", report("quality")],
        ]);
        expect(second).toEqual(first);
    });

    test("blocks fan-in after a critic failure", () => {
        const fanout = createReviewFanout(3);

        fanout.dispatch();
        fanout.fail("risk");
        fanout.complete("correctness", report("correctness"));
        fanout.complete("quality", report("quality"));

        expect(fanout.blocked).toBe(true);
        expect(fanout.failed).toEqual(["risk"]);
        expect(fanout.allReportsCollected()).toBe(false);
    });

    test("lets active and pending critics finish after a failure", () => {
        const fanout = createReviewFanout(2);

        expect(fanout.dispatch()).toEqual(["correctness", "risk"]);
        fanout.fail("correctness");
        expect(fanout.active).toBe(1);
        expect(fanout.dispatch()).toEqual(["quality"]);
        expect(fanout.complete("risk", report("risk"))).toBe(true);
        expect(fanout.complete("quality", report("quality"))).toBe(true);
        expect(fanout.blocked).toBe(true);
        expect(fanout.allReportsCollected()).toBe(false);
    });

    test("can fail a pending critic without dispatching it", () => {
        const fanout = createReviewFanout(1);

        fanout.fail("risk");
        expect(fanout.pending).toEqual(["correctness", "quality"]);
        expect(fanout.dispatch()).toEqual(["correctness"]);
        expect(fanout.failed).toEqual(["risk"]);
        expect(fanout.blocked).toBe(true);
    });

    test("resets all state for a remediation re-review", () => {
        const fanout = createReviewFanout(3);

        fanout.dispatch();
        fanout.complete("correctness", report("correctness"));
        fanout.fail("risk");
        fanout.complete("quality", report("quality"));
        fanout.reset();

        expect(fanout.blocked).toBe(false);
        expect(fanout.active).toBe(0);
        expect(fanout.pending).toEqual(["correctness", "risk", "quality"]);
        expect(fanout.completed).toEqual([]);
        expect(fanout.failed).toEqual([]);
        expect([...fanout.reports()]).toEqual([]);
        expect(fanout.dispatch()).toEqual(["correctness", "risk", "quality"]);
    });

    test("rejects duplicate completion and unknown completion without changing state", () => {
        const fanout = createReviewFanout(1);

        fanout.dispatch();
        expect(fanout.complete("correctness", report("correctness"))).toBe(true);
        expect(fanout.complete("correctness", "replacement")).toBe(false);
        expect(fanout.complete("risk" as ReviewCriticId, report("risk"))).toBe(false);
        expect(fanout.completed).toEqual(["correctness"]);
        expect(fanout.reports().get("correctness")).toBe(report("correctness"));
    });

    test("makes failure idempotent", () => {
        const fanout = createReviewFanout(1);

        fanout.dispatch();
        fanout.fail("correctness");
        fanout.fail("correctness");

        expect(fanout.failed).toEqual(["correctness"]);
        expect(fanout.blocked).toBe(true);
        expect(fanout.active).toBe(0);
    });
});
