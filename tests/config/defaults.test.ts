import { describe, expect, test } from "bun:test";
import { ALL_AGENT_IDS } from "../../src/agents/ids.js";
import { DEFAULT_CONFIG } from "../../src/config.js";

describe("DEFAULT_CONFIG", () => {
    test("contains exactly the seven roles", () => {
        expect(Object.keys(DEFAULT_CONFIG.agents).sort()).toEqual([...ALL_AGENT_IDS].sort());
    });

    test("every role maps to an empty entry", () => {
        for (const id of ALL_AGENT_IDS) {
            expect(DEFAULT_CONFIG.agents[id]).toEqual({});
        }
    });

    test("structuredClone is independent of the original", () => {
        const copy = structuredClone(DEFAULT_CONFIG);
        copy.agents["specops-coordinator"].model = "openference/GLM-5.2";
        expect(DEFAULT_CONFIG.agents["specops-coordinator"]).toEqual({});
    });
});
