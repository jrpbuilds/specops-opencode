import { describe, expect, test } from "bun:test";
import { AGENT_IDS, ALL_AGENT_IDS, ROLE_WORKFLOW_ORDER } from "../../src/agents/ids.js";
import { ROLE_META, type RoleMeta } from "../../src/agents/roles.js";
import { loadPrompt } from "../../src/prompts.js";

describe("ROLE_META catalogue consistency", () => {
    test("key set matches the configurable role catalogue", () => {
        expect(Object.keys(ROLE_META).sort()).toEqual([...ALL_AGENT_IDS].sort());
    });

    test("ROLE_WORKFLOW_ORDER is a permutation of the registry keys", () => {
        expect([...ROLE_WORKFLOW_ORDER].sort()).toEqual([...ALL_AGENT_IDS].sort());
    });

    test("every role has a non-empty display name and prompt file", () => {
        for (const id of ALL_AGENT_IDS) {
            expect(ROLE_META[id].displayName.trim()).not.toBe("");
            expect(ROLE_META[id].promptFile.trim()).not.toBe("");
        }
    });

    test("exactly the three review specialists declare reviewer inheritance", () => {
        const inheriting = ALL_AGENT_IDS.filter(
            id => (ROLE_META[id] as RoleMeta).inheritsModelFrom === AGENT_IDS.reviewer,
        );
        expect(inheriting.sort()).toEqual(
            [AGENT_IDS.reviewCorrectness, AGENT_IDS.reviewRisk, AGENT_IDS.reviewQuality].sort(),
        );
    });

    test("every role's prompt asset is packaged, loadable, and non-empty", () => {
        for (const id of ALL_AGENT_IDS) {
            expect(loadPrompt(id).trim()).not.toBe("");
        }
    });
});
