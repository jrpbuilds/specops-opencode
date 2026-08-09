import { describe, expect, test } from "bun:test";
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
});

describe("validateConfig - role catalogue", () => {
    test("rejects empty agents", () => {
        expect(() => validateConfig({ agents: {} })).toThrow();
    });

    test("rejects a missing role", () => {
        const agents = allRoles();
        delete agents["specops-reviewer"];
        expect(() => validateConfig({ agents })).toThrow();
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
});

describe("validateConfig - isolation", () => {
    test("returns a deep clone so mutating the result cannot affect the input", () => {
        const input = structuredClone(DEFAULT_CONFIG);
        const result = validateConfig(input);
        result.agents["specops-coordinator"].model = "openference/GLM-5.2";
        expect(input.agents["specops-coordinator"]).toEqual({});
    });
});
