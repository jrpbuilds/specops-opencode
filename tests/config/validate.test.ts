import { describe, expect, test } from "bun:test";
import { AGENT_IDS, ALL_AGENT_IDS } from "../../src/agents/ids.js";
import { DEFAULT_CONFIG, validateConfig } from "../../src/config.js";

/**
 * Build a complete role map with a cloned entry for every configured role.
 *
 * Cloning each value prevents one test mutation from accidentally sharing state
 * across role entries while keeping individual validation cases concise.
 */
function allRoles(value: Record<string, unknown> = {}): Record<string, unknown> {
    return Object.fromEntries(
        Object.keys(DEFAULT_CONFIG.agents).map(id => [id, structuredClone(value)]),
    );
}

describe("validateConfig - valid shapes", () => {
    test("accepts the default config with all empty entries", () => {
        expect(validateConfig(structuredClone(DEFAULT_CONFIG))).toEqual(DEFAULT_CONFIG);
    });

    test("accepts a model with no variant", () => {
        const value = { agents: allRoles({ model: "openference/GLM-5.2" }) };
        expect(validateConfig(value).agents["specops-coordinator"]).toEqual({
            model: "openference/GLM-5.2",
        });
    });

    test("accepts a model with a variant", () => {
        const value = {
            agents: allRoles({ model: "openference/GLM-5.2", variant: "high" }),
        };
        expect(validateConfig(value).agents["specops-planner"]).toEqual({
            model: "openference/GLM-5.2",
            variant: "high",
        });
    });

    test("accepts an absent model with no variant (blank default)", () => {
        const value = { agents: allRoles() };
        const result = validateConfig(value);
        expect(result.agents["specops-frontier"]).toEqual({});
        expect(result.frontierEscalation).toBe(false);
    });

    test("accepts an explicitly enabled frontier escalation switch", () => {
        const value = { agents: allRoles(), frontierEscalation: true };
        expect(validateConfig(value).frontierEscalation).toBe(true);
    });

    test("accepts an explicitly disabled frontier escalation switch", () => {
        const value = { agents: allRoles(), frontierEscalation: false };
        expect(validateConfig(value).frontierEscalation).toBe(false);
    });

    for (const maxSubagentConcurrency of [1, 2, 3, 4, 5, 6, 7, 8, 9, 64]) {
        test(`accepts concurrency limit ${maxSubagentConcurrency}`, () => {
            const value = { agents: allRoles(), maxSubagentConcurrency };
            expect(validateConfig(value).maxSubagentConcurrency).toBe(maxSubagentConcurrency);
        });
    }

    for (const maxAutoReviewIterations of [1, 2, 3, 8, 9, 64]) {
        test(`accepts Auto review iteration budget ${maxAutoReviewIterations}`, () => {
            const value = { agents: allRoles(), maxAutoReviewIterations };
            expect(validateConfig(value).maxAutoReviewIterations).toBe(maxAutoReviewIterations);
        });
    }

    for (const implementerFanout of ["auto", "always", "never"] as const) {
        test(`accepts implementer fan-out mode ${implementerFanout}`, () => {
            const value = { agents: allRoles(), implementerFanout };
            expect(validateConfig(value).implementerFanout).toBe(implementerFanout);
        });
    }

    for (const reviewFanout of ["auto", "always", "never"] as const) {
        test(`accepts review fan-out mode ${reviewFanout}`, () => {
            const value = { agents: allRoles(), reviewFanout };
            expect(validateConfig(value).reviewFanout).toBe(reviewFanout);
        });
    }

    test("defaults both fan-out modes to auto when omitted", () => {
        const result = validateConfig({ agents: allRoles() });
        expect(result.implementerFanout).toBe("auto");
        expect(result.reviewFanout).toBe("auto");
    });
});

describe("validateConfig - top-level structure", () => {
    test("rejects a non-object (array)", () => {
        expect(() => validateConfig([])).toThrow();
    });

    test("rejects null", () => {
        expect(() => validateConfig(null)).toThrow();
    });

    test("rejects a primitive", () => {
        expect(() => validateConfig("not a config")).toThrow();
    });

    test("rejects a missing agents field", () => {
        expect(() => validateConfig({})).toThrow();
    });

    test("rejects an extra top-level key", () => {
        expect(() => validateConfig({ ...DEFAULT_CONFIG, extra: true })).toThrow();
    });

    test("rejects agents that is not an object", () => {
        expect(() => validateConfig({ agents: [] })).toThrow();
    });

    for (const [label, frontierEscalation] of [
        ["string", "true"],
        ["number", 1],
        ["null", null],
        ["object", {}],
        ["array", []],
    ] as const) {
        test(`rejects a non-boolean frontier escalation value: ${label}`, () => {
            expect(() => validateConfig({ agents: allRoles(), frontierEscalation })).toThrow();
        });
    }

    for (const [label, maxSubagentConcurrency] of [
        ["zero", 0],
        ["negative", -1],
        ["fraction", 2.5],
        ["string", "2"],
        ["boolean", true],
        ["object", {}],
        ["array", []],
        ["null", null],
        ["NaN", NaN],
        ["infinity", Infinity],
    ] as const) {
        test(`rejects an invalid concurrency limit: ${label}`, () => {
            expect(() => validateConfig({ agents: allRoles(), maxSubagentConcurrency })).toThrow(
                "maxSubagentConcurrency must be a positive integer",
            );
        });
    }

    for (const [label, maxAutoReviewIterations] of [
        ["zero", 0],
        ["negative", -1],
        ["fraction", 2.5],
        ["string", "2"],
        ["boolean", true],
        ["object", {}],
        ["array", []],
        ["null", null],
        ["NaN", NaN],
        ["infinity", Infinity],
    ] as const) {
        test(`rejects an invalid Auto review iteration budget: ${label}`, () => {
            expect(() => validateConfig({ agents: allRoles(), maxAutoReviewIterations })).toThrow(
                "maxAutoReviewIterations must be a positive integer",
            );
        });
    }

    for (const [label, fanout] of [
        ["string", "2"],
        ["boolean", true],
        ["object", {}],
        ["array", []],
        ["null", null],
        ["empty string", ""],
        ["unknown mode", "sometimes"],
        ["uppercase mode", "Auto"],
    ] as const) {
        test(`rejects an invalid implementer fan-out mode: ${label}`, () => {
            expect(() => validateConfig({ agents: allRoles(), implementerFanout: fanout })).toThrow(
                "implementerFanout must be one of: auto, always, never",
            );
        });
        test(`rejects an invalid review fan-out mode: ${label}`, () => {
            expect(() => validateConfig({ agents: allRoles(), reviewFanout: fanout })).toThrow(
                "reviewFanout must be one of: auto, always, never",
            );
        });
    }
});

describe("validateConfig - role catalogue", () => {
    test("fills an empty agent map with an all-empty catalogue", () => {
        const config = validateConfig({ agents: {} });
        expect(Object.keys(config.agents)).toHaveLength(ALL_AGENT_IDS.length);
        for (const id of ALL_AGENT_IDS) expect(config.agents[id]).toEqual({});
    });

    test("fills a missing role with an empty inheriting entry", () => {
        const agents = allRoles();
        delete agents["specops-reviewer"];
        const config = validateConfig({ agents });

        expect(Object.keys(config.agents).sort()).toEqual([...ALL_AGENT_IDS].sort());
        expect(config.agents["specops-reviewer"]).toEqual({});
        expect(config.agents["specops-planner"]).toEqual({});
    });

    test("fills missing review specialists with empty inheriting entries", () => {
        const agents = allRoles();
        delete agents[AGENT_IDS.reviewCorrectness];
        delete agents[AGENT_IDS.reviewRisk];
        delete agents[AGENT_IDS.reviewQuality];
        const config = validateConfig({ agents });

        expect(config.agents[AGENT_IDS.reviewCorrectness]).toEqual({});
        expect(config.agents[AGENT_IDS.reviewRisk]).toEqual({});
        expect(config.agents[AGENT_IDS.reviewQuality]).toEqual({});
    });

    test("rejects an extra role", () => {
        const agents = allRoles();
        agents["specops-architect"] = {};
        expect(() => validateConfig({ agents })).toThrow();
    });

    test("rejects a mistyped role id", () => {
        const agents = allRoles();
        delete agents["specops-planner"];
        agents["specops-planer"] = {};
        expect(() => validateConfig({ agents })).toThrow();
    });
});

describe("validateConfig - entry shape", () => {
    test("rejects an entry that is not an object", () => {
        const agents = allRoles();
        agents["specops-coordinator"] = "openference/GLM-5.2";
        expect(() => validateConfig({ agents })).toThrow();
    });

    test("rejects an entry with an extra key", () => {
        const agents = allRoles();
        agents["specops-implementer"] = { model: "x", maxSteps: 10 };
        expect(() => validateConfig({ agents })).toThrow();
    });

    test("rejects a non-string model", () => {
        const agents = allRoles();
        agents["specops-explorer"] = { model: 42 };
        expect(() => validateConfig({ agents })).toThrow();
    });

    test("rejects a non-string variant", () => {
        const agents = allRoles();
        agents["specops-explorer"] = { model: "x", variant: 99 };
        expect(() => validateConfig({ agents })).toThrow();
    });

    test("rejects an empty variant string", () => {
        const agents = allRoles();
        agents["specops-explorer"] = { model: "x", variant: "" };
        expect(() => validateConfig({ agents })).toThrow();
    });

    test("rejects a whitespace-only variant", () => {
        const agents = allRoles();
        agents["specops-explorer"] = { model: "x", variant: "   " };
        expect(() => validateConfig({ agents })).toThrow();
    });

    test("rejects a non-blank variant without a model context", () => {
        const agents = allRoles();
        agents[AGENT_IDS.reviewRisk] = { variant: "high" };
        expect(() => validateConfig({ agents })).toThrow();
    });

    test("allows a critic variant when Reviewer supplies the effective model", () => {
        const agents = allRoles();
        agents[AGENT_IDS.reviewer] = { model: "openai/gpt-5.6-terra" };
        agents[AGENT_IDS.reviewQuality] = { variant: "high" };
        expect(validateConfig({ agents }).agents[AGENT_IDS.reviewQuality]).toEqual({
            variant: "high",
        });
    });

    test("keeps non-critic variant validation independent of Reviewer", () => {
        const agents = allRoles();
        agents[AGENT_IDS.planner] = { variant: "high" };
        agents[AGENT_IDS.reviewer] = { model: "openai/gpt-5.6-terra" };
        expect(() => validateConfig({ agents })).toThrow();
    });
});

describe("validateConfig - isolation", () => {
    test("returns a deep clone so mutating the result cannot affect the input", () => {
        const input = structuredClone(DEFAULT_CONFIG);
        const result = validateConfig(input);
        result.agents["specops-coordinator"].model = "openference/GLM-5.2";
        expect(input.agents["specops-coordinator"]).toEqual({});
    });
});
