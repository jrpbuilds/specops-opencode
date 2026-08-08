import type { Config } from "@opencode-ai/plugin";
import { describe, expect, test } from "bun:test";
import { AGENT_IDS } from "../../src/agents/ids.js";
import { registerCoordinatorAgent, SPECOPS_AGENT_ID } from "../../src/agents/coordinator.js";
import { loadPrompt } from "../../src/prompts.js";
import type { SpecOpsConfig } from "../../src/config.js";

/** Build a valid config with only the supplied coordinator overrides. */
function makeConfig(overrides: Partial<SpecOpsConfig["agents"]> = {}): SpecOpsConfig {
    const defaults = Object.fromEntries(
        Object.values(AGENT_IDS).map(id => [id, {}]),
    ) as SpecOpsConfig["agents"];
    return { agents: { ...defaults, ...overrides } as SpecOpsConfig["agents"] };
}

describe("registerCoordinatorAgent", () => {
    test("registers the SpecOps primary agent with the coordinator prompt", () => {
        const config: Config = {};
        registerCoordinatorAgent(config, makeConfig());

        expect(config.agent?.[SPECOPS_AGENT_ID]).toEqual({
            description: "SpecOps coordinator for spec-driven development",
            mode: "primary",
            prompt: loadPrompt(AGENT_IDS.coordinator),
        });
    });

    test("coordinator prompt delegates source-code exploration to specops-explorer", () => {
        const prompt = loadPrompt(AGENT_IDS.coordinator);

        expect(prompt).toContain("specops-explorer");
        expect(prompt).toContain("Do not read source files");
    });

    test("coordinator prompt delegates proposal/spec authoring to specops-planner", () => {
        const prompt = loadPrompt(AGENT_IDS.coordinator);

        expect(prompt).toContain("specops-planner");
        expect(prompt).toContain("Do not author OpenSpec `proposal.md`");
        expect(prompt).toContain("current OpenSpec change name");
        expect(prompt).toContain("relevant findings returned by `specops-explorer`");
    });

    test("applies configured coordinator model and variant", () => {
        const config: Config = {};
        registerCoordinatorAgent(
            config,
            makeConfig({
                [AGENT_IDS.coordinator]: {
                    model: "opencode-go/deepseek-v4-flash",
                    variant: "high",
                },
            }),
        );

        expect(config.agent?.[SPECOPS_AGENT_ID]).toMatchObject({
            model: "opencode-go/deepseek-v4-flash",
            variant: "high",
        });
    });

    test("applies model without variant when only model is configured", () => {
        const config: Config = {};
        registerCoordinatorAgent(
            config,
            makeConfig({ [AGENT_IDS.coordinator]: { model: "openai/gpt-5" } }),
        );

        expect(config.agent?.[SPECOPS_AGENT_ID]?.model).toBe("openai/gpt-5");
        expect("variant" in (config.agent?.[SPECOPS_AGENT_ID] ?? {})).toBe(false);
    });

    test("omits model and variant for blank model to preserve OpenCode default", () => {
        const config: Config = {};
        registerCoordinatorAgent(
            config,
            makeConfig({ [AGENT_IDS.coordinator]: { model: "   ", variant: "high" } }),
        );

        expect("model" in (config.agent?.[SPECOPS_AGENT_ID] ?? {})).toBe(false);
        expect("variant" in (config.agent?.[SPECOPS_AGENT_ID] ?? {})).toBe(false);
    });

    test("does not modify existing built-in agents", () => {
        const config: Config = {
            agent: {
                build: { description: "Build", mode: "primary", prompt: "Build prompt" },
                plan: { description: "Plan", mode: "primary", prompt: "Plan prompt" },
            },
        };
        registerCoordinatorAgent(config, makeConfig());

        expect(config.agent?.build?.description).toBe("Build");
        expect(config.agent?.plan?.description).toBe("Plan");
    });
});
