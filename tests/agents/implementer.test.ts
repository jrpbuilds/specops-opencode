import type { Config } from "@opencode-ai/plugin";
import { describe, expect, test } from "bun:test";
import { AGENT_IDS } from "../../src/agents/ids.js";
import { IMPLEMENTER_AGENT_ID, registerImplementerAgent } from "../../src/agents/implementer.js";
import { loadPrompt } from "../../src/prompts.js";
import type { SpecOpsConfig } from "../../src/config.js";

/** Build a valid config with only the supplied implementer overrides. */
function makeConfig(overrides: Partial<SpecOpsConfig["agents"]> = {}): SpecOpsConfig {
    const defaults = Object.fromEntries(
        Object.values(AGENT_IDS).map(id => [id, {}]),
    ) as SpecOpsConfig["agents"];
    return { agents: { ...defaults, ...overrides } as SpecOpsConfig["agents"] };
}

describe("registerImplementerAgent", () => {
    test("registers the SpecOps implementer subagent with the implementer prompt", () => {
        const config: Config = {};
        registerImplementerAgent(config, makeConfig());

        expect(config.agent?.[IMPLEMENTER_AGENT_ID]).toEqual({
            description:
                "Implements approved OpenSpec tasks in source and tests, runs verification, and marks completed tasks in tasks.md. Use this agent to execute SpecOps implementation plans.",
            mode: "subagent",
            prompt: loadPrompt(AGENT_IDS.implementer),
        });
    });

    test("implementer prompt owns unchecked task execution and direct source changes", () => {
        const prompt = loadPrompt(AGENT_IDS.implementer);

        expect(prompt).toContain("executing the unchecked tasks in `tasks.md`");
        expect(prompt).toContain("Inspect and modify repository source code and tests directly");
        expect(prompt).not.toContain("Do not inspect repository source code yourself");
    });

    test("implementer prompt gates task completion on verification", () => {
        const prompt = loadPrompt(AGENT_IDS.implementer);

        expect(prompt).toContain("only then change `- [ ]` to `- [x]`");
        expect(prompt).toContain("leave it unchecked");
        expect(prompt).toContain("Do not fabricate completion");
    });

    test("implementer prompt preserves planning boundaries and forbids self-approval", () => {
        const prompt = loadPrompt(AGENT_IDS.implementer);

        expect(prompt).toContain("Do not silently redesign");
        expect(prompt).toContain("Do not weaken or delete tests");
        expect(prompt).toContain("Do not review or approve your own implementation");
        expect(prompt).toContain("Do not archive");
    });

    test("applies configured implementer model and variant", () => {
        const config: Config = {};
        registerImplementerAgent(
            config,
            makeConfig({
                [AGENT_IDS.implementer]: {
                    model: "openai/gpt-5.6-terra",
                    variant: "high",
                },
            }),
        );

        expect(config.agent?.[IMPLEMENTER_AGENT_ID]).toMatchObject({
            model: "openai/gpt-5.6-terra",
            variant: "high",
        });
    });

    test("applies model without variant when only model is configured", () => {
        const config: Config = {};
        registerImplementerAgent(
            config,
            makeConfig({ [AGENT_IDS.implementer]: { model: "openai/gpt-5" } }),
        );

        expect(config.agent?.[IMPLEMENTER_AGENT_ID]?.model).toBe("openai/gpt-5");
        expect("variant" in (config.agent?.[IMPLEMENTER_AGENT_ID] ?? {})).toBe(false);
    });

    test("omits model and variant for blank model to preserve OpenCode fallback", () => {
        const config: Config = {};
        registerImplementerAgent(
            config,
            makeConfig({ [AGENT_IDS.implementer]: { model: "   ", variant: "high" } }),
        );

        expect("model" in (config.agent?.[IMPLEMENTER_AGENT_ID] ?? {})).toBe(false);
        expect("variant" in (config.agent?.[IMPLEMENTER_AGENT_ID] ?? {})).toBe(false);
    });

    test("does not modify existing agents including the planning specialists", () => {
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
                [AGENT_IDS.designer]: {
                    description: "Designer",
                    mode: "subagent",
                    prompt: "Designer prompt",
                },
            },
        };
        registerImplementerAgent(config, makeConfig());

        expect(config.agent?.build?.description).toBe("Build");
        expect(config.agent?.[AGENT_IDS.coordinator]?.description).toBe("Coordinator");
        expect(config.agent?.[AGENT_IDS.explorer]?.description).toBe("Explorer");
        expect(config.agent?.[AGENT_IDS.planner]?.description).toBe("Planner");
        expect(config.agent?.[AGENT_IDS.designer]?.description).toBe("Designer");
    });
});
