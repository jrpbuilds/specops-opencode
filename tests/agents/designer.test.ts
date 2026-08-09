import type { Config } from "@opencode-ai/plugin";
import { describe, expect, test } from "bun:test";
import { AGENT_IDS } from "../../src/agents/ids.js";
import { DESIGNER_AGENT_ID, registerDesignerAgent } from "../../src/agents/designer.js";
import { loadPrompt } from "../../src/prompts.js";
import type { SpecOpsConfig } from "../../src/config.js";

/** Build a complete valid role config with optional designer overrides. */
function makeConfig(overrides: Partial<SpecOpsConfig["agents"]> = {}): SpecOpsConfig {
    const defaults = Object.fromEntries(
        Object.values(AGENT_IDS).map(id => [id, {}]),
    ) as SpecOpsConfig["agents"];
    return { agents: { ...defaults, ...overrides } as SpecOpsConfig["agents"] };
}

describe("registerDesignerAgent", () => {
    test("registers the SpecOps designer subagent with the designer prompt", () => {
        const config: Config = {};
        registerDesignerAgent(config, makeConfig());

        expect(config.agent?.[DESIGNER_AGENT_ID]).toEqual({
            description:
                "Authors the technical OpenSpec design from approved requirements and repository evidence. Use this agent to create design.md for SpecOps changes.",
            mode: "subagent",
            prompt: loadPrompt(AGENT_IDS.designer),
        });
    });

    test("designer prompt forbids source exploration, task authoring, and implementation", () => {
        const prompt = loadPrompt(AGENT_IDS.designer);

        expect(prompt).toContain("Do not inspect repository source code yourself");
        expect(prompt).toContain("Do not modify the proposal or capability specifications");
        expect(prompt).toContain("stop and report it to the coordinator for resolution");
        expect(prompt).toContain("Do not author `tasks.md`");
        expect(prompt).toContain("Do not implement source changes");
        expect(prompt).toContain("`design.md` proportional to the change");
    });

    test("applies configured designer model and variant", () => {
        const config: Config = {};
        registerDesignerAgent(
            config,
            makeConfig({
                [AGENT_IDS.designer]: {
                    model: "openai/gpt-5.6-terra",
                    variant: "high",
                },
            }),
        );

        expect(config.agent?.[DESIGNER_AGENT_ID]).toMatchObject({
            model: "openai/gpt-5.6-terra",
            variant: "high",
        });
    });

    test("applies model without variant when only model is configured", () => {
        const config: Config = {};
        registerDesignerAgent(
            config,
            makeConfig({ [AGENT_IDS.designer]: { model: "openai/gpt-5" } }),
        );

        expect(config.agent?.[DESIGNER_AGENT_ID]?.model).toBe("openai/gpt-5");
        expect("variant" in (config.agent?.[DESIGNER_AGENT_ID] ?? {})).toBe(false);
    });

    test("omits model and variant for blank model to preserve OpenCode fallback", () => {
        const config: Config = {};
        registerDesignerAgent(
            config,
            makeConfig({ [AGENT_IDS.designer]: { model: "   ", variant: "high" } }),
        );

        expect("model" in (config.agent?.[DESIGNER_AGENT_ID] ?? {})).toBe(false);
        expect("variant" in (config.agent?.[DESIGNER_AGENT_ID] ?? {})).toBe(false);
    });

    test("does not modify existing agents including the coordinator, explorer, and planner", () => {
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
                [AGENT_IDS.planner]: {
                    description: "Planner",
                    mode: "subagent",
                    prompt: "Planner prompt",
                },
            },
        };
        registerDesignerAgent(config, makeConfig());

        expect(config.agent?.build?.description).toBe("Build");
        expect(config.agent?.[AGENT_IDS.coordinator]?.description).toBe("Coordinator");
        expect(config.agent?.[AGENT_IDS.explorer]?.description).toBe("Explorer");
        expect(config.agent?.[AGENT_IDS.planner]?.description).toBe("Planner");
    });
});
