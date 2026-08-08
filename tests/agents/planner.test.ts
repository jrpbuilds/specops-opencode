import type { Config } from "@opencode-ai/plugin";
import { describe, expect, test } from "bun:test";
import { AGENT_IDS } from "../../src/agents/ids.js";
import { PLANNER_AGENT_ID, registerPlannerAgent } from "../../src/agents/planner.js";
import { loadPrompt } from "../../src/prompts.js";
import type { SpecOpsConfig } from "../../src/config.js";

/** Build a valid config with only the supplied planner overrides. */
function makeConfig(overrides: Partial<SpecOpsConfig["agents"]> = {}): SpecOpsConfig {
    const defaults = Object.fromEntries(
        Object.values(AGENT_IDS).map(id => [id, {}]),
    ) as SpecOpsConfig["agents"];
    return { agents: { ...defaults, ...overrides } as SpecOpsConfig["agents"] };
}

describe("registerPlannerAgent", () => {
    test("registers the SpecOps planner subagent with the planner prompt", () => {
        const config: Config = {};
        registerPlannerAgent(config, makeConfig());

        expect(config.agent?.[PLANNER_AGENT_ID]).toEqual({
            description:
                "Authors OpenSpec change proposals and capability specifications from the user's goal and repository evidence. Use this agent for SpecOps planning artifacts.",
            mode: "subagent",
            prompt: loadPrompt(AGENT_IDS.planner),
        });
    });

    test("planner prompt forbids source exploration, design/tasks, and implementation", () => {
        const prompt = loadPrompt(AGENT_IDS.planner);

        expect(prompt).toContain("Do not inspect repository source code yourself");
        expect(prompt).toContain("Do not author `design.md` or `tasks.md`");
        expect(prompt).toContain("Do not implement source changes");
    });

    test("applies configured planner model and variant", () => {
        const config: Config = {};
        registerPlannerAgent(
            config,
            makeConfig({
                [AGENT_IDS.planner]: {
                    model: "openai/gpt-5.6-terra",
                    variant: "high",
                },
            }),
        );

        expect(config.agent?.[PLANNER_AGENT_ID]).toMatchObject({
            model: "openai/gpt-5.6-terra",
            variant: "high",
        });
    });

    test("applies model without variant when only model is configured", () => {
        const config: Config = {};
        registerPlannerAgent(
            config,
            makeConfig({ [AGENT_IDS.planner]: { model: "openai/gpt-5" } }),
        );

        expect(config.agent?.[PLANNER_AGENT_ID]?.model).toBe("openai/gpt-5");
        expect("variant" in (config.agent?.[PLANNER_AGENT_ID] ?? {})).toBe(false);
    });

    test("omits model and variant for blank model to preserve OpenCode fallback", () => {
        const config: Config = {};
        registerPlannerAgent(
            config,
            makeConfig({ [AGENT_IDS.planner]: { model: "   ", variant: "high" } }),
        );

        expect("model" in (config.agent?.[PLANNER_AGENT_ID] ?? {})).toBe(false);
        expect("variant" in (config.agent?.[PLANNER_AGENT_ID] ?? {})).toBe(false);
    });

    test("does not modify existing agents including the coordinator and explorer", () => {
        const config: Config = {
            agent: {
                build: { description: "Build", mode: "primary", prompt: "Build prompt" },
                [AGENT_IDS.coordinator]: {
                    description: "Coordinator",
                    mode: "primary",
                    prompt: "Coordinator prompt",
                },
                [AGENT_IDS.explorer]: {
                    description: "Explorer",
                    mode: "subagent",
                    prompt: "Explorer prompt",
                },
            },
        };
        registerPlannerAgent(config, makeConfig());

        expect(config.agent?.build?.description).toBe("Build");
        expect(config.agent?.[AGENT_IDS.coordinator]?.description).toBe("Coordinator");
        expect(config.agent?.[AGENT_IDS.explorer]?.description).toBe("Explorer");
    });
});
