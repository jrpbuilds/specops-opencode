import { describe, expect, test } from "bun:test";
import { AGENT_IDS } from "../../src/agents/ids.js";
import { DEFAULT_CONFIG, resolveAgentMapping, type SpecOpsConfig } from "../../src/config.js";

function configWith(overrides: Partial<SpecOpsConfig["agents"]> = {}): SpecOpsConfig {
    return {
        ...structuredClone(DEFAULT_CONFIG),
        agents: {
            ...structuredClone(DEFAULT_CONFIG.agents),
            ...overrides,
        },
    };
}

describe("resolveAgentMapping", () => {
    test("empty critic entry inherits Reviewer's model", () => {
        const config = configWith({ [AGENT_IDS.reviewer]: { model: "reviewer/model" } });

        expect(resolveAgentMapping(config, AGENT_IDS.reviewCorrectness)).toEqual({
            model: "reviewer/model",
        });
    });

    test("empty critic entry inherits Reviewer's model and variant", () => {
        const config = configWith({
            [AGENT_IDS.reviewer]: { model: "reviewer/model", variant: "high" },
        });

        expect(resolveAgentMapping(config, AGENT_IDS.reviewRisk)).toEqual({
            model: "reviewer/model",
            variant: "high",
        });
    });

    test("absent model and variant fields inherit Reviewer's full mapping", () => {
        const config = configWith({
            [AGENT_IDS.reviewer]: { model: "reviewer/model", variant: "medium" },
            [AGENT_IDS.reviewQuality]: {},
        });

        expect(resolveAgentMapping(config, AGENT_IDS.reviewQuality)).toEqual({
            model: "reviewer/model",
            variant: "medium",
        });
    });

    test("explicit critic model overrides Reviewer's model", () => {
        const config = configWith({
            [AGENT_IDS.reviewer]: { model: "reviewer/model" },
            [AGENT_IDS.reviewCorrectness]: { model: "critic/model" },
        });

        expect(resolveAgentMapping(config, AGENT_IDS.reviewCorrectness)).toEqual({
            model: "critic/model",
        });
    });

    test("explicit critic variant overrides Reviewer's variant", () => {
        const config = configWith({
            [AGENT_IDS.reviewer]: { model: "reviewer/model", variant: "review" },
            [AGENT_IDS.reviewRisk]: { model: "critic/model", variant: "critic" },
        });

        expect(resolveAgentMapping(config, AGENT_IDS.reviewRisk)).toEqual({
            model: "critic/model",
            variant: "critic",
        });
    });

    test("critic model with unset variant keeps its own default variant", () => {
        const config = configWith({
            [AGENT_IDS.reviewer]: { model: "reviewer/model", variant: "review" },
            [AGENT_IDS.reviewQuality]: { model: "critic/model" },
        });

        expect(resolveAgentMapping(config, AGENT_IDS.reviewQuality)).toEqual({
            model: "critic/model",
        });
    });

    test("variant-only critic inherits Reviewer's model but keeps its own variant", () => {
        const config = configWith({
            [AGENT_IDS.reviewer]: { model: "reviewer/model", variant: "review" },
            [AGENT_IDS.reviewRisk]: { variant: "high" },
        });

        expect(resolveAgentMapping(config, AGENT_IDS.reviewRisk)).toEqual({
            model: "reviewer/model",
            variant: "high",
        });
    });

    test("blank critic and Reviewer mappings preserve host-default behavior", () => {
        const config = configWith({
            [AGENT_IDS.reviewer]: {},
            [AGENT_IDS.reviewCorrectness]: { model: "  " },
        });
        const reviewerMapping = resolveAgentMapping(config, AGENT_IDS.reviewer);

        expect(resolveAgentMapping(config, AGENT_IDS.reviewCorrectness)).toEqual({});
        expect(resolveAgentMapping(config, AGENT_IDS.reviewCorrectness)).toEqual(reviewerMapping);
    });

    test("returns non-critic mappings without applying inheritance", () => {
        const config = configWith({
            [AGENT_IDS.reviewer]: { model: "reviewer/model" },
            [AGENT_IDS.planner]: { model: "planner/model", variant: "high" },
        });

        expect(resolveAgentMapping(config, AGENT_IDS.planner)).toEqual({
            model: "planner/model",
            variant: "high",
        });
    });

    test("does not mutate the configuration", () => {
        const config = configWith({
            [AGENT_IDS.reviewer]: { model: "reviewer/model", variant: "high" },
        });
        const before = structuredClone(config);

        resolveAgentMapping(config, AGENT_IDS.reviewCorrectness);

        expect(config).toEqual(before);
    });
});
