import type { Config } from "@opencode-ai/plugin";
import { describe, expect, test } from "bun:test";
import { AGENT_IDS } from "../../src/agents/ids.js";
import { EXPLORER_AGENT_ID, registerExplorerAgent } from "../../src/agents/explorer.js";
import { loadPrompt } from "../../src/prompts.js";
import type { SpecOpsConfig } from "../../src/config.js";

/** Build a complete valid role config with optional explorer overrides. */
function makeConfig(overrides: Partial<SpecOpsConfig["agents"]> = {}): SpecOpsConfig {
    const defaults = Object.fromEntries(
        Object.values(AGENT_IDS).map(id => [id, {}]),
    ) as SpecOpsConfig["agents"];
    return { agents: { ...defaults, ...overrides } as SpecOpsConfig["agents"] };
}

describe("registerExplorerAgent", () => {
    test("registers the SpecOps explorer subagent with the explorer prompt", () => {
        const config: Config = {};
        registerExplorerAgent(config, makeConfig());

        expect(config.agent?.[EXPLORER_AGENT_ID]).toEqual({
            description:
                "Investigates repository source, behavior, conventions, tests, constraints, and risks for planning and design. Use when the SpecOps coordinator needs focused repository evidence.",
            mode: "subagent",
            prompt: loadPrompt(AGENT_IDS.explorer),
        });
    });

    test("explorer prompt forbids source changes and requires the complete final report", () => {
        const prompt = loadPrompt(AGENT_IDS.explorer);

        expect(prompt).toContain("Do not implement source changes");
        expect(prompt).toContain("Do not make final planning or design decisions");
        expect(prompt).toContain("complete findings in your final response");
        expect(prompt).toContain("conventions and tooling");
        expect(prompt).toContain("risks and assumptions");
        expect(prompt).toContain("unresolved questions, and blockers");
        expect(prompt).toContain("Do not require the coordinator to resume your session");
    });

    test("applies configured explorer model and variant", () => {
        const config: Config = {};
        registerExplorerAgent(
            config,
            makeConfig({
                [AGENT_IDS.explorer]: {
                    model: "openference/Qwen3.7 Plus",
                    variant: "medium",
                },
            }),
        );

        expect(config.agent?.[EXPLORER_AGENT_ID]).toMatchObject({
            model: "openference/Qwen3.7 Plus",
            variant: "medium",
        });
    });

    test("applies model without variant when only model is configured", () => {
        const config: Config = {};
        registerExplorerAgent(
            config,
            makeConfig({ [AGENT_IDS.explorer]: { model: "openai/gpt-5" } }),
        );

        expect(config.agent?.[EXPLORER_AGENT_ID]?.model).toBe("openai/gpt-5");
        expect("variant" in (config.agent?.[EXPLORER_AGENT_ID] ?? {})).toBe(false);
    });

    test("omits model and variant for blank model to preserve OpenCode fallback", () => {
        const config: Config = {};
        registerExplorerAgent(
            config,
            makeConfig({ [AGENT_IDS.explorer]: { model: "   ", variant: "medium" } }),
        );

        expect("model" in (config.agent?.[EXPLORER_AGENT_ID] ?? {})).toBe(false);
        expect("variant" in (config.agent?.[EXPLORER_AGENT_ID] ?? {})).toBe(false);
    });

    test("does not modify existing agents including the coordinator", () => {
        const config: Config = {
            agent: {
                build: { description: "Build", mode: "primary", prompt: "Build prompt" },
                [AGENT_IDS.coordinator]: {
                    description: "Coordinator",
                    mode: "primary",
                    prompt: "Coordinator prompt",
                },
            },
        };
        registerExplorerAgent(config, makeConfig());

        expect(config.agent?.build?.description).toBe("Build");
        expect(config.agent?.[AGENT_IDS.coordinator]?.description).toBe("Coordinator");
    });
});
