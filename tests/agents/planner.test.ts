import type { Config } from "@opencode-ai/plugin";
import { describe, expect, test } from "bun:test";
import { AGENT_IDS } from "../../src/agents/ids.js";
import { PLANNER_AGENT_ID, registerPlannerAgent } from "../../src/agents/planner.js";
import { SPECOPS_AUTO_REPLICATE_PERMISSION } from "../../src/agents/permissions.js";
import { loadPrompt } from "../../src/prompts.js";
import type { SpecOpsConfig } from "../../src/config.js";

/** Build a complete valid role config with optional planner overrides. */
function makeConfig(overrides: Partial<SpecOpsConfig["agents"]> = {}): SpecOpsConfig {
    const defaults = Object.fromEntries(
        Object.values(AGENT_IDS).map(id => [id, {}]),
    ) as SpecOpsConfig["agents"];
    return {
        agents: { ...defaults, ...overrides } as SpecOpsConfig["agents"],
        frontierEscalation: false,
    };
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
            permission: { ...SPECOPS_AUTO_REPLICATE_PERMISSION },
        });
    });

    test("planner prompt owns both proposal/specs and tasks.md across two passes", () => {
        const prompt = loadPrompt(AGENT_IDS.planner);

        expect(prompt).toContain("## Requirements planning");
        expect(prompt).toContain("## Task planning");
        expect(prompt).toContain("`proposal.md`, when missing or incomplete");
        expect(prompt).toContain("capability `spec.md` files that are missing or incomplete");
        expect(prompt).toContain("Preserve completed artifacts");
        expect(prompt).toContain("author or revise `tasks.md`");
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

    test("planner prompt allows tasks.md revision and preserves unaffected tasks", () => {
        const prompt = loadPrompt(AGENT_IDS.planner);

        expect(prompt).toContain(
            "`tasks.md` is missing or the coordinator explicitly returns it for revision",
        );
        expect(prompt).toContain("revise only the affected tasks");
        expect(prompt).toContain("preserve everything else");
        expect(prompt).toContain("including any existing `- [x]` completion state");
        expect(prompt).toContain("Do not regenerate unaffected tasks");
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

    test("planner prompt returns the standard handoff envelope and keeps special modes standalone", () => {
        const prompt = loadPrompt(AGENT_IDS.planner);

        expect(prompt).toContain("## Handoff");
        expect(prompt).toContain("STATUS: success | blocked");
        expect(prompt).toContain("SUMMARY:");
        expect(prompt).toContain("ARTIFACTS:");
        expect(prompt).toContain("VERIFICATION:");
        expect(prompt).toContain("RISKS:");
        expect(prompt).toContain("NEXT:");
        expect(prompt).toContain("never ordinary changed source or test files");
        expect(prompt).toContain("return that block alone — do not prepend the handoff envelope");
        expect(prompt).toContain("`NEXT` is advisory only and never overrides");
    });

    test("planner prompt consumes Project Context as non-authoritative orientation", () => {
        const prompt = loadPrompt(AGENT_IDS.planner);

        expect(prompt).toContain("## Project Context");
        expect(prompt).toContain("use it as orientation");
        expect(prompt).toContain("not authoritative");
        expect(prompt).toContain("win if they conflict");
        expect(prompt).toContain("Do not copy Project Context into");
        expect(prompt).toContain("report the missing evidence to the coordinator");
    });

    test("planner prompt uses the shared optional Engram policy", () => {
        const prompt = loadPrompt(AGENT_IDS.planner);

        expect(prompt).toContain("## Engram");
        expect(prompt).toContain("If Engram memory tools are available, you may use them");
        expect(prompt).toContain("Use Engram as contextual memory, not authority.");
        expect(prompt).toContain(
            "Current explicit user instructions and the current approved OpenSpec artifacts govern the change;",
        );
        expect(prompt).toContain(
            "current repository and executed evidence govern what exists today.",
        );
        expect(prompt).toContain(
            "Engram memory must yield whenever it conflicts with any of them.",
        );
        expect(prompt).toContain(
            "Do not use Engram as an alternative store for SpecOps change artifacts or workflow state.",
        );
        expect(prompt).toContain(
            "Engram is optional. Its absence or failure must not block your pass.",
        );
        expect(prompt).not.toContain("Do not call any Engram");
        expect(prompt).not.toContain("the Explorer owns Engram retrieval");
    });

    test("planner prompt defines Frontier-eligible blocker request and resume behaviour", () => {
        const prompt = loadPrompt(AGENT_IDS.planner);

        expect(prompt).toContain("## Frontier escalation");
        expect(prompt).toContain("FRONTIER ELIGIBLE BLOCKER");
        expect(prompt).toContain("Blocker:");
        expect(prompt).toContain("What I tried:");
        expect(prompt).toContain("Why this is genuinely difficult:");
        expect(prompt).toContain("Question for Frontier:");
        expect(prompt).toContain(
            "Do not report a Frontier-eligible blocker for missing repository evidence",
        );
        expect(prompt).toContain("resume the same pass");
        expect(prompt).toContain("Frontier advice is advisory only");
    });
});
