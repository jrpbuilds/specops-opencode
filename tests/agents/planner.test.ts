import type { Config } from "@opencode-ai/plugin";
import { describe, expect, test } from "bun:test";
import { AGENT_IDS } from "../../src/agents/ids.js";
import { PLANNER_AGENT_ID, registerPlannerAgent } from "../../src/agents/planner.js";
import { loadPrompt } from "../../src/prompts.js";
import type { SpecOpsConfig } from "../../src/config.js";

/** Build a complete valid role config with optional planner overrides. */
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
                "Authors OpenSpec planning artifacts — proposals, capability specifications, and implementation tasks — from the user's goal and repository evidence. Use this agent for SpecOps planning artifacts.",
            mode: "subagent",
            prompt: loadPrompt(AGENT_IDS.planner),
        });
    });

    test("planner prompt owns both proposal/specs and tasks.md across two passes", () => {
        const prompt = loadPrompt(AGENT_IDS.planner);

        expect(prompt).toContain("## Requirements planning");
        expect(prompt).toContain("## Task planning");
        expect(prompt).toContain("`proposal.md`, when missing or incomplete");
        expect(prompt).toContain("capability `spec.md` files that are missing or incomplete");
        expect(prompt).toContain("Preserve completed artifacts");
        expect(prompt).toContain("author `tasks.md`");
    });

    test("planner prompt defines material-decision escalation and resume behavior", () => {
        const prompt = loadPrompt(AGENT_IDS.planner);

        expect(prompt).toContain("## Escalating material unresolved decisions");
        expect(prompt).toContain("materially affects requirements");
        expect(prompt).toContain("Do not ask the coordinator about choices you can safely make");
        expect(prompt).toContain("USER DECISION REQUIRED");
        expect(prompt).toContain("exactly one decision request");
        expect(prompt).toContain("2–4 materially distinct options");
        expect(prompt).toContain(
            "Do not ask the coordinator to generate, merge, remove, or rank options",
        );
        expect(prompt).toContain("resume the **same pass**");
        expect(prompt).toContain("new USER DECISION REQUIRED request");
        expect(prompt).toContain("Do not persist the question or answer");
    });

    test("planner prompt distinguishes resolvable conflicts from user-scope conflicts", () => {
        const prompt = loadPrompt(AGENT_IDS.planner);

        expect(prompt).toContain("internal or artifact conflict can be resolved");
        expect(prompt).toContain("report it to the coordinator as a conflict");
        expect(prompt).toContain("materially conflicting user requirements or constraints");
        expect(prompt).toContain("escalate that conflict as a USER DECISION REQUIRED request");
    });

    test("planner prompt gates tasks on design.md and forbids implementation and checkboxes", () => {
        const prompt = loadPrompt(AGENT_IDS.planner);

        expect(prompt).toContain("`design.md` exists, and `tasks.md` is missing");
        expect(prompt).toContain("Do not inspect repository source code yourself");
        expect(prompt).toContain("Do not author `design.md` or `tasks.md` during this pass");
        expect(prompt).toContain("Do not implement source changes yourself");
        expect(prompt).toContain("Do not mark tasks complete");
        expect(prompt).toContain("- [ ]");
        expect(prompt).toContain("return a concise summary");
        expect(prompt).toContain("openspec instructions <artifact> --change <change>");
        expect(prompt).toContain("artifact scope and detail proportional to the change");
        expect(prompt).toContain("right-sized for coherent implementation");
        expect(prompt).not.toContain("no implementation specialist is available");
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
