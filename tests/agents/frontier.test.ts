import type { Config } from "@opencode-ai/plugin";
import { describe, expect, test } from "bun:test";
import { AGENT_IDS } from "../../src/agents/ids.js";
import { FRONTIER_AGENT_ID, registerFrontierAgent } from "../../src/agents/frontier.js";
import { loadPrompt } from "../../src/prompts.js";
import type { SpecOpsConfig } from "../../src/config.js";

/** Build a complete valid role config with optional frontier overrides. */
function makeConfig(overrides: Partial<SpecOpsConfig["agents"]> = {}): SpecOpsConfig {
    const defaults = Object.fromEntries(
        Object.values(AGENT_IDS).map(id => [id, {}]),
    ) as SpecOpsConfig["agents"];
    return {
        agents: { ...defaults, ...overrides } as SpecOpsConfig["agents"],
        frontierEscalation: false,
    };
}

describe("registerFrontierAgent", () => {
    test("registers the SpecOps frontier subagent with the frontier prompt", () => {
        const config: Config = {};
        registerFrontierAgent(config, makeConfig());

        expect(config.agent?.[FRONTIER_AGENT_ID]).toEqual({
            description:
                "Advice-only consultation for genuinely difficult unresolved technical " +
                "blockers raised by SpecOps specialists. Returns technical advice only; does " +
                "not modify source, OpenSpec artifacts, tasks, workflow state, review " +
                "verdicts, or lifecycle state.",
            mode: "subagent",
            prompt: loadPrompt(AGENT_IDS.frontier),
        });
    });

    test("frontier prompt is advice-only and forbids modifications", () => {
        const prompt = loadPrompt(AGENT_IDS.frontier);

        expect(prompt).toContain("advice only");
        expect(prompt).toContain("must not modify anything");
        expect(prompt).toContain("Do not edit source code, tests, or configuration");
        expect(prompt).toContain("Do not modify OpenSpec artifacts");
        expect(prompt).toContain("Do not change task completion state");
        expect(prompt).toContain("review verdicts");
        expect(prompt).toContain("Do not archive the change");
        expect(prompt).toContain("Do not run `specops_*` tools");
        expect(prompt).toContain("Do not invoke other subagents");
    });

    test("frontier prompt returns a focused FRONTIER ADVICE block", () => {
        const prompt = loadPrompt(AGENT_IDS.frontier);

        expect(prompt).toContain("FRONTIER ADVICE");
        expect(prompt).toContain("Analysis:");
        expect(prompt).toContain("Recommendation:");
        expect(prompt).toContain("Alternatives:");
        expect(prompt).toContain("Caveats:");
        expect(prompt).toContain("omit the Alternatives section");
        expect(prompt).toContain("one clearly correct answer");
        expect(prompt).toContain("Return only the advice block");
        expect(prompt).toContain("Do not persist anything");
        expect(prompt).toContain("Do not ask the user questions directly");
    });

    test("frontier prompt routes missing evidence back to explorer", () => {
        const prompt = loadPrompt(AGENT_IDS.frontier);

        expect(prompt).toContain("missing repository evidence");
        expect(prompt).toContain("`specops-explorer`");
    });

    test("applies configured frontier model and variant", () => {
        const config: Config = {};
        registerFrontierAgent(
            config,
            makeConfig({
                [AGENT_IDS.frontier]: {
                    model: "openference/GLM-5.2",
                    variant: "high",
                },
            }),
        );

        expect(config.agent?.[FRONTIER_AGENT_ID]).toMatchObject({
            model: "openference/GLM-5.2",
            variant: "high",
        });
    });

    test("applies model without variant when only model is configured", () => {
        const config: Config = {};
        registerFrontierAgent(
            config,
            makeConfig({ [AGENT_IDS.frontier]: { model: "openai/gpt-5" } }),
        );

        expect(config.agent?.[FRONTIER_AGENT_ID]?.model).toBe("openai/gpt-5");
        expect("variant" in (config.agent?.[FRONTIER_AGENT_ID] ?? {})).toBe(false);
    });

    test("omits model and variant for blank model to preserve OpenCode fallback", () => {
        const config: Config = {};
        registerFrontierAgent(
            config,
            makeConfig({ [AGENT_IDS.frontier]: { model: "   ", variant: "high" } }),
        );

        expect("model" in (config.agent?.[FRONTIER_AGENT_ID] ?? {})).toBe(false);
        expect("variant" in (config.agent?.[FRONTIER_AGENT_ID] ?? {})).toBe(false);
    });

    test("does not modify existing agents", () => {
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
        registerFrontierAgent(config, makeConfig());

        expect(config.agent?.build?.description).toBe("Build");
        expect(config.agent?.[AGENT_IDS.coordinator]?.description).toBe("Coordinator");
    });
});
