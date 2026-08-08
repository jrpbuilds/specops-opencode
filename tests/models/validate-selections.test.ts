import { describe, expect, test } from "bun:test";
import { AGENT_IDS } from "../../src/agents.js";
import { DEFAULT_CONFIG } from "../../src/config.js";
import { configuredModels, validateConfigSelections } from "../../src/models.js";
import { allProviders } from "../fixtures.js";

const models = configuredModels(allProviders);

function withRole(id: string, entry: Record<string, unknown>) {
    const config = structuredClone(DEFAULT_CONFIG);
    config.agents[id as keyof typeof config.agents] = entry as never;
    return config;
}

describe("validateConfigSelections", () => {
    test("reports no issues when every role is blank", () => {
        expect(validateConfigSelections(DEFAULT_CONFIG, models)).toEqual([]);
    });

    test("reports no issues for a model with a supported variant", () => {
        const config = withRole(AGENT_IDS.planner, {
            model: "openference/GLM-5.2",
            variant: "high",
        });
        expect(validateConfigSelections(config, models)).toEqual([]);
    });

    test("flags a variant without a model", () => {
        const config = withRole(AGENT_IDS.explorer, { variant: "high" });
        expect(validateConfigSelections(config, models)).toEqual([
            "specops-explorer: variant high requires a model",
        ]);
    });

    test("flags an unknown model", () => {
        const config = withRole(AGENT_IDS.reviewer, { model: "ghost/missing" });
        expect(validateConfigSelections(config, models)).toEqual([
            "specops-reviewer: model ghost/missing is not currently configured",
        ]);
    });

    test("flags a variant the model does not support", () => {
        const config = withRole(AGENT_IDS.implementer, {
            model: "openference/GLM-5.2",
            variant: "thinking",
        });
        expect(validateConfigSelections(config, models)).toEqual([
            "specops-implementer: variant thinking is unavailable for openference/GLM-5.2",
        ]);
    });

    test("reports no issues for a blank model with no variant", () => {
        const config = withRole(AGENT_IDS.frontier, {});
        expect(validateConfigSelections(config, models)).toEqual([]);
    });
});
