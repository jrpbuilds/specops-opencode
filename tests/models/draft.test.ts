import { describe, expect, test } from "bun:test";
import { ALL_AGENT_IDS, AGENT_IDS } from "../../src/agents/ids.js";
import { DEFAULT_CONFIG } from "../../src/config.js";
import { configuredModels, createConfigDraft } from "../../src/models.js";
import { allProviders } from "../fixtures.js";

const models = configuredModels(allProviders);

describe("createConfigDraft", () => {
    test("returns all seven roles", () => {
        const draft = createConfigDraft(DEFAULT_CONFIG, models);
        expect(Object.keys(draft.config.agents).sort()).toEqual([...ALL_AGENT_IDS].sort());
    });

    test("copies model and variant from the source", () => {
        const source = structuredClone(DEFAULT_CONFIG);
        source.agents[AGENT_IDS.planner] = {
            model: "openference/GLM-5.2",
            variant: "high",
        };
        const draft = createConfigDraft(source, models);
        expect(draft.config.agents[AGENT_IDS.planner]).toEqual({
            model: "openference/GLM-5.2",
            variant: "high",
        });
    });

    test("drops a blank model (trimmed) so the entry has no model key", () => {
        const source = structuredClone(DEFAULT_CONFIG);
        source.agents[AGENT_IDS.explorer] = { model: "   " };
        const draft = createConfigDraft(source, models);
        expect(draft.config.agents[AGENT_IDS.explorer]).toEqual({});
    });

    test("flags a role whose saved model is not in the catalogue as unresolved", () => {
        const source = structuredClone(DEFAULT_CONFIG);
        source.agents[AGENT_IDS.reviewer] = { model: "ghost/missing-model" };
        const draft = createConfigDraft(source, models);
        expect(draft.unresolved).toContain(AGENT_IDS.reviewer);
    });

    test("does not flag a blank model as unresolved", () => {
        const source = structuredClone(DEFAULT_CONFIG);
        const draft = createConfigDraft(source, models);
        expect(draft.unresolved).toEqual([]);
    });

    test("retains a variant even when the source model is blank", () => {
        const source = structuredClone(DEFAULT_CONFIG);
        source.agents[AGENT_IDS.frontier] = { variant: "high" };
        const draft = createConfigDraft(source, models);
        expect(draft.config.agents[AGENT_IDS.frontier]).toEqual({
            variant: "high",
        });
    });
});
