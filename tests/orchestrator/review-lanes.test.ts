import { describe, expect, test } from "bun:test";
import {
    parseReviewLaneDispatch,
    parseReviewRoundIdentity,
    validateReviewLanes,
} from "../../src/orchestrator/review-lanes.js";
import type { ReviewLaneDefinition } from "../../src/orchestrator/review-lanes.js";

describe("validateReviewLanes", () => {
    test("accepts one lane, the three-lens shape, and expanded same-lens scopes in order", () => {
        const lanes = [
            { id: "C1", lens: "correctness", scope: "booking frontend" },
            { id: "C2", lens: "correctness", scope: "booking API" },
            { id: "R1", lens: "risk", scope: "authentication boundary" },
            { id: "R2", lens: "risk", scope: "database migration" },
            { id: "Q1", lens: "quality", scope: "cross-layer integration" },
        ] satisfies readonly ReviewLaneDefinition[];

        expect(validateReviewLanes([lanes[0]])).toEqual({ ok: true, lanes: [lanes[0]] });
        expect(validateReviewLanes([lanes[0], lanes[2], lanes[4]])).toEqual({
            ok: true,
            lanes: [lanes[0], lanes[2], lanes[4]],
        });
        expect(validateReviewLanes(lanes)).toEqual({ ok: true, lanes });
    });

    test("preserves optional advisory hints without changing lane identity", () => {
        expect(
            validateReviewLanes([
                {
                    id: "R1",
                    lens: "risk",
                    scope: "auth boundary",
                    capabilityHints: ["security review"],
                },
            ]),
        ).toEqual({
            ok: true,
            lanes: [
                {
                    id: "R1",
                    lens: "risk",
                    scope: "auth boundary",
                    capabilityHints: ["security review"],
                },
            ],
        });
    });

    test("rejects malformed plans, duplicate IDs, unsupported lenses, and extra fields", () => {
        expect(validateReviewLanes([])).toEqual({
            ok: false,
            error: "review lanes must be a non-empty array",
        });
        expect(
            validateReviewLanes([
                { id: "C1", lens: "correctness", scope: "frontend" },
                { id: "C1", lens: "correctness", scope: "backend" },
            ]),
        ).toEqual({ ok: false, error: "duplicate review lane id 'C1'" });
        expect(validateReviewLanes([{ id: "R1", lens: "security", scope: "auth" }])).toEqual({
            ok: false,
            error: "review lane 'R1' has an unsupported lens; expected correctness, risk, or quality",
        });
        expect(
            validateReviewLanes([{ id: "Q1", lens: "quality", scope: "integration", extra: true }]),
        ).toEqual({
            ok: false,
            error: "review lane #1 has unsupported field(s): extra",
        });
    });

    test("rejects blank, multiline, and malformed identity or hint values", () => {
        expect(validateReviewLanes([{ id: " ", lens: "quality", scope: "integration" }]).ok).toBe(
            false,
        );
        expect(
            validateReviewLanes([{ id: "Q1", lens: "quality", scope: "first\nsecond" }]),
        ).toEqual({
            ok: false,
            error: "review lane 'Q1' must have a non-empty, single-line scope",
        });
        expect(
            validateReviewLanes([
                { id: "Q1", lens: "quality", scope: "integration", capabilityHints: [""] },
            ]).ok,
        ).toBe(false);
    });
});

describe("review dispatch identity", () => {
    test("requires one exact round, lane, and single-line scope", () => {
        expect(
            parseReviewLaneDispatch(
                "changeName: sample\nreviewRoundId: review-round-1\nreviewLaneId: C1\nreviewScope: frontend",
            ),
        ).toEqual({
            ok: true,
            identity: { roundId: "review-round-1", laneId: "C1", scope: "frontend" },
        });
        expect(
            parseReviewLaneDispatch(
                "reviewRoundId: r1\nreviewRoundId: r2\nreviewLaneId: C1\nreviewScope: frontend",
            ).ok,
        ).toBe(false);
        expect(parseReviewLaneDispatch("reviewLaneId: C1\nreviewScope: frontend")).toEqual({
            ok: false,
            error: "reviewRoundId must appear exactly once in the critic dispatch",
        });
    });

    test("allows a direct-review prompt without a round but validates supplied round IDs", () => {
        expect(parseReviewRoundIdentity("direct review")).toEqual({ ok: true, roundId: undefined });
        expect(parseReviewRoundIdentity("reviewRoundId: review-round-2")).toEqual({
            ok: true,
            roundId: "review-round-2",
        });
        expect(parseReviewRoundIdentity("reviewRoundId: invalid value").ok).toBe(false);
    });
});
