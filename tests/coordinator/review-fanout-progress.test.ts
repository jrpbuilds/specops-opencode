import { describe, expect, test } from "bun:test";
import {
    summarizeReviewFanout,
    type ReviewFanoutSnapshot,
} from "../../src/coordinator/review-fanout.js";

const fullSnapshot = (overrides: Partial<ReviewFanoutSnapshot> = {}): ReviewFanoutSnapshot => ({
    pending: [],
    inFlight: [],
    completed: [],
    failed: [],
    ...overrides,
});

describe("summarizeReviewFanout", () => {
    test("maps each of the four states to its critic status", () => {
        const result = summarizeReviewFanout(
            fullSnapshot({
                pending: ["quality"],
                inFlight: ["correctness"],
                completed: ["risk"],
                failed: [],
            }),
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.progress.critics).toEqual([
            { id: "correctness", status: "inFlight" },
            { id: "risk", status: "completed" },
            { id: "quality", status: "pending" },
        ]);
    });

    test("maps a failed critic to the failed status", () => {
        const result = summarizeReviewFanout(
            fullSnapshot({
                pending: ["correctness", "risk"],
                inFlight: [],
                completed: [],
                failed: ["quality"],
            }),
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.progress.critics).toEqual([
            { id: "correctness", status: "pending" },
            { id: "risk", status: "pending" },
            { id: "quality", status: "failed" },
        ]);
    });

    test("emits critics in canonical order regardless of input order", () => {
        const result = summarizeReviewFanout(
            fullSnapshot({
                pending: ["quality"],
                inFlight: ["risk"],
                completed: ["correctness"],
                failed: [],
            }),
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.progress.critics.map(critic => critic.id)).toEqual([
            "correctness",
            "risk",
            "quality",
        ]);
        expect(result.progress.critics.map(critic => critic.status)).toEqual([
            "completed",
            "inFlight",
            "pending",
        ]);
    });

    test("derives counts from the projected critics for a mixed snapshot", () => {
        const result = summarizeReviewFanout(
            fullSnapshot({
                pending: ["correctness"],
                inFlight: ["risk"],
                completed: [],
                failed: ["quality"],
            }),
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.progress.counts).toEqual({
            pending: 1,
            inFlight: 1,
            completed: 0,
            failed: 1,
        });
    });

    test("treats a present empty list as valid, not missing", () => {
        const result = summarizeReviewFanout(
            fullSnapshot({
                pending: [],
                inFlight: ["correctness"],
                completed: ["risk"],
                failed: ["quality"],
            }),
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.progress.counts).toEqual({
            pending: 0,
            inFlight: 1,
            completed: 1,
            failed: 1,
        });
    });

    test("fails closed when every state list is present but empty", () => {
        const result = summarizeReviewFanout(
            fullSnapshot({ pending: [], inFlight: [], completed: [], failed: [] }),
        );

        expect(result).toEqual({
            ok: false,
            error: "critic 'correctness' is missing from all state lists",
        });
    });

    test("rejects an unknown critic id verbatim", () => {
        const result = summarizeReviewFanout(
            fullSnapshot({
                pending: ["perf"],
                inFlight: ["correctness"],
                completed: ["risk"],
                failed: ["quality"],
            }),
        );

        expect(result).toEqual({ ok: false, error: "unknown critic id 'perf'" });
    });

    test("rejects a critic appearing in two sets", () => {
        const result = summarizeReviewFanout(
            fullSnapshot({
                pending: ["correctness"],
                inFlight: [],
                completed: ["correctness", "risk"],
                failed: ["quality"],
            }),
        );

        expect(result).toEqual({
            ok: false,
            error: "critic 'correctness' appears in both 'pending' and 'completed'",
        });
    });

    test("rejects a critic duplicated within one set", () => {
        const result = summarizeReviewFanout(
            fullSnapshot({
                pending: ["correctness"],
                inFlight: ["risk", "risk"],
                completed: [],
                failed: ["quality"],
            }),
        );

        expect(result).toEqual({
            ok: false,
            error: "critic 'risk' appears more than once in 'inFlight'",
        });
    });

    test("rejects a canonical critic missing from all sets", () => {
        const result = summarizeReviewFanout(
            fullSnapshot({
                pending: ["correctness"],
                inFlight: ["risk"],
                completed: [],
                failed: [],
            }),
        );

        expect(result).toEqual({
            ok: false,
            error: "critic 'quality' is missing from all state lists",
        });
    });

    test("rejects each absent list while another list is present", () => {
        const cases: [keyof ReviewFanoutSnapshot, ReviewFanoutSnapshot][] = [
            ["pending", { inFlight: ["correctness"], completed: ["risk"], failed: ["quality"] }],
            ["inFlight", { pending: ["correctness"], completed: ["risk"], failed: ["quality"] }],
            ["completed", { pending: ["correctness"], inFlight: ["risk"], failed: ["quality"] }],
            ["failed", { pending: ["quality"], inFlight: ["correctness"], completed: ["risk"] }],
        ];

        for (const [absent, snapshot] of cases) {
            expect(summarizeReviewFanout(snapshot)).toEqual({
                ok: false,
                error: `fan-out snapshot is missing state list(s): ${absent}`,
            });
        }
    });

    test("names every missing list in canonical order", () => {
        const result = summarizeReviewFanout(
            fullSnapshot({
                pending: ["correctness"],
                inFlight: undefined,
                completed: undefined,
                failed: undefined,
            }),
        );

        expect(result).toEqual({
            ok: false,
            error: "fan-out snapshot is missing state list(s): inFlight, completed, failed",
        });
    });

    test("fails closed on a supplied-but-empty snapshot object", () => {
        const result = summarizeReviewFanout({});

        expect(result).toEqual({
            ok: false,
            error: "fan-out snapshot is missing state list(s): pending, inFlight, completed, failed",
        });
    });

    test("never mutates the input snapshot", () => {
        const before = JSON.stringify(
            fullSnapshot({
                pending: ["quality"],
                inFlight: ["correctness"],
                completed: ["risk"],
                failed: [],
            }),
        );
        const snapshot = JSON.parse(before) as ReviewFanoutSnapshot;

        summarizeReviewFanout(snapshot);

        expect(JSON.stringify(snapshot)).toBe(before);
    });
});
