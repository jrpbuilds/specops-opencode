import { describe, expect, test } from "bun:test";
import { ALL_AGENT_IDS } from "../../src/agents/ids.js";
import { DEFAULT_CONFIG } from "../../src/config.js";

describe("DEFAULT_CONFIG", () => {
    test("contains exactly the catalogue roles", () => {
        expect(Object.keys(DEFAULT_CONFIG.agents).sort()).toEqual([...ALL_AGENT_IDS].sort());
    });

    test("every role maps to an empty entry", () => {
        for (const id of ALL_AGENT_IDS) {
            expect(DEFAULT_CONFIG.agents[id]).toEqual({});
        }
    });

    test("provides empty Reviewer-inheriting entries for every review specialist", () => {
        for (const id of [
            "specops-review-correctness",
            "specops-review-risk",
            "specops-review-quality",
        ] as const) {
            expect(Object.keys(DEFAULT_CONFIG.agents).filter(roleId => roleId === id)).toHaveLength(
                1,
            );
            expect(DEFAULT_CONFIG.agents[id]).toEqual({});
        }
    });

    test("disables frontier escalation by default", () => {
        expect(DEFAULT_CONFIG.frontierEscalation).toBe(false);
    });

    test("uses two concurrent subagents by default", () => {
        expect(DEFAULT_CONFIG.maxSubagentConcurrency).toBe(2);
    });

    test("allows three Auto review correction iterations by default", () => {
        expect(DEFAULT_CONFIG.maxAutoReviewIterations).toBe(3);
    });

    test("structuredClone is independent of the original", () => {
        const copy = structuredClone(DEFAULT_CONFIG);
        copy.agents["specops-coordinator"].model = "openference/GLM-5.2";
        expect(DEFAULT_CONFIG.agents["specops-coordinator"]).toEqual({});
    });
});
