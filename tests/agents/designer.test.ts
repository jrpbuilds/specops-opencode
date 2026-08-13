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
    return {
        agents: { ...defaults, ...overrides } as SpecOpsConfig["agents"],
        frontierEscalation: false,
    };
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
        expect(prompt).toContain(
            "If the coordinator explicitly returns `design.md` for revision after an upstream change",
        );
        expect(prompt).toContain("revise only the affected design decisions");
        expect(prompt).toContain("preserve the rest");
    });

    test("designer prompt defines material-decision escalation and resume behavior", () => {
        const prompt = loadPrompt(AGENT_IDS.designer);

        expect(prompt).toContain("## Escalating material unresolved technical decisions");
        expect(prompt).toContain("materially different");
        expect(prompt).toContain("USER DECISION REQUIRED");
        expect(prompt).toContain("exactly one decision request");
        expect(prompt).toContain("2–4 materially distinct options");
        expect(prompt).toContain("Every option must satisfy the approved requirements");
        expect(prompt).toContain(
            "Do not ask the coordinator to generate, merge, remove, or rank options",
        );
        expect(prompt).toContain("new USER DECISION REQUIRED request");
        expect(prompt).toContain("Do not persist the question or answer");
    });

    test("designer prompt distinguishes blocking from deferrable Open Questions", () => {
        const prompt = loadPrompt(AGENT_IDS.designer);

        expect(prompt).toContain("### Open Questions in design.md");
        expect(prompt).toContain("deferrable");
        expect(prompt).toContain("blocking");
        expect(prompt).toContain("## Open Questions");
        expect(prompt).toContain("## Decisions");
        expect(prompt).toContain("No blocking Open Question may survive into `tasks.md`");
    });

    test("designer prompt routes requirements conflicts instead of changing requirements", () => {
        const prompt = loadPrompt(AGENT_IDS.designer);

        expect(prompt).toContain("Do not modify `proposal.md` or capability specifications");
        expect(prompt).toContain("reported to the coordinator as a conflict for Planner routing");
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

    test("designer prompt returns the standard handoff envelope and keeps special modes standalone", () => {
        const prompt = loadPrompt(AGENT_IDS.designer);

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

    test("designer prompt consumes Project Context as non-authoritative orientation", () => {
        const prompt = loadPrompt(AGENT_IDS.designer);

        expect(prompt).toContain("## Project Context");
        expect(prompt).toContain("use it as orientation");
        expect(prompt).toContain("not authoritative");
        expect(prompt).toContain("Do not copy Project Context into `design.md`");
        expect(prompt).toContain("report the missing evidence to the coordinator");
    });

    test("designer prompt defines Frontier-eligible blocker request and resume behaviour", () => {
        const prompt = loadPrompt(AGENT_IDS.designer);

        const section = prompt.slice(prompt.indexOf("## Frontier escalation"));

        expect(prompt).toContain("## Frontier escalation");
        expect(section).toContain("FRONTIER ELIGIBLE BLOCKER");
        expect(section).toContain("materially different architecture");
        expect(section).toContain(
            "Do not report a Frontier-eligible blocker for missing repository evidence",
        );
        expect(section).toContain("resume the same pass");
        expect(section).toContain("Frontier advice is advisory only");
        expect(section).toContain("You remain responsible for `design.md`");
    });
});
