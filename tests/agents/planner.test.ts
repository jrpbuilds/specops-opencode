import type { Config } from "@opencode-ai/plugin";
import { describe, expect, test } from "bun:test";
import { AGENT_IDS } from "../../src/agents/ids.js";
import { PLANNER_AGENT_ID } from "../../src/agents/planner.js";
import { PLANNER_PERMISSION } from "../../src/agents/permissions.js";
import {
    DEFAULT_AUTO_REVIEW_ITERATIONS,
    DEFAULT_IMPLEMENTER_FANOUT,
    DEFAULT_REVIEW_FANOUT,
    DEFAULT_SUBAGENT_CONCURRENCY,
    type SpecOpsConfig,
} from "../../src/config.js";
import { registerWorkflowSubagents } from "../../src/host/agents.js";
import { loadPrompt } from "../../src/prompts.js";

function makeConfig(overrides: Partial<SpecOpsConfig["agents"]> = {}): SpecOpsConfig {
    const defaults = Object.fromEntries(
        Object.values(AGENT_IDS).map(id => [id, {}]),
    ) as SpecOpsConfig["agents"];
    return {
        agents: { ...defaults, ...overrides } as SpecOpsConfig["agents"],
        frontierEscalation: false,
        maxSubagentConcurrency: DEFAULT_SUBAGENT_CONCURRENCY,
        maxAutoReviewIterations: DEFAULT_AUTO_REVIEW_ITERATIONS,
        implementerFanout: DEFAULT_IMPLEMENTER_FANOUT,
        reviewFanout: DEFAULT_REVIEW_FANOUT,
    };
}

describe("planner agent", () => {
    test("registers the planner with its role prompt and permission policy", () => {
        const config: Config = {};
        registerWorkflowSubagents(config, makeConfig());

        expect(config.agent?.[PLANNER_AGENT_ID] as Record<string, unknown>).toEqual({
            description:
                "Authors OpenSpec planning artifacts — proposals, capability specifications, and implementation tasks — from the user's goal and repository evidence. Use this agent for SpecOps planning artifacts.",
            mode: "subagent",
            hidden: true,
            permission: PLANNER_PERMISSION,
            prompt: loadPrompt(AGENT_IDS.planner),
        });
    });

    test("uses dispatch context and the active schema instead of generic artifact branching", () => {
        const prompt = loadPrompt(AGENT_IDS.planner);

        expect(prompt).toContain("one OpenSpec planning artifact named by");
        expect(prompt).toMatch(/do not reconstruct them\s+from a generic workflow/);
        expect(prompt).toContain("including custom schemas");
        expect(prompt).not.toContain("createRollingScheduler");
        expect(prompt).not.toContain("maxSubagentConcurrency");
    });

    test("keeps evidence boundaries and material-decision escalation", () => {
        const prompt = loadPrompt(AGENT_IDS.planner);

        expect(prompt).toContain("Use the user's goal, approved upstream artifacts");
        expect(prompt).toContain("repository evidence");
        expect(prompt).toContain("`specops-explorer`");
        expect(prompt).toContain("## Material decisions");
        expect(prompt).toContain("materially affects requirements");
        expect(prompt).toContain("USER DECISION REQUIRED");
        expect(prompt).toContain("2–4 materially distinct options");
        expect(prompt).toContain("Do not author partial work");
    });

    test("keeps requirements quality guidance without designing", () => {
        const prompt = loadPrompt(AGENT_IDS.planner);

        expect(prompt).toContain("## Requirements planning");
        expect(prompt).toContain("externally observable behaviour");
        expect(prompt).toContain("independently verifiable");
        expect(prompt).toContain("Requirements state what must be true");
        expect(prompt).toContain("## Task planning");
        expect(prompt).toContain(
            "Produce concrete implementation outcomes with explicit dependencies",
        );
        expect(prompt).toContain("Keep tightly related work together");
        expect(prompt).toContain("boundaries are genuinely independent");
        expect(prompt).toContain("- [ ] X.Y <description>");
        expect(prompt).toContain("Leave every task unchecked");
        expect(prompt).not.toContain(
            "Split into separate lanes only on genuine implementation segregation",
        );
    });

    test("preserves revision, validation, and role boundaries", () => {
        const prompt = loadPrompt(AGENT_IDS.planner);

        expect(prompt).toContain("`revisionTarget`");
        expect(prompt).toContain("`upstreamFeedback`");
        expect(prompt).toContain("preserve unaffected artifacts");
        expect(prompt).toMatch(/valid `- \[x\]` task\s+state/);
        expect(prompt).toMatch(/Never\s+implement source changes or mark tasks complete/);
        expect(prompt).toContain("openspec validate <change>");
        expect(prompt).toContain("`no deltas found`");
        expect(prompt).toContain("Real validation failures are blockers");
        expect(prompt).not.toContain("Graph readiness is the orchestrator's responsibility");
    });

    test("keeps terminal handoff, Project Context, and Frontier contracts", () => {
        const prompt = loadPrompt(AGENT_IDS.planner);

        expect(prompt).toContain("## Project Context");
        expect(prompt).toContain("not authority");
        expect(prompt).toContain("report the missing evidence");
        expect(prompt).toContain("## Handoff");
        expect(prompt).toContain("STATUS: success | blocked");
        expect(prompt).toContain("## Frontier escalation");
        expect(prompt).toContain("FRONTIER ELIGIBLE BLOCKER");
        expect(prompt).toContain("resume the same pass and artifact");
        expect(prompt).toContain("## Engram");
        expect(prompt).not.toContain("mem_");
    });

    test("applies configured planner model and preserves OpenCode fallback", () => {
        const configured: Config = {};
        registerWorkflowSubagents(
            configured,
            makeConfig({ [AGENT_IDS.planner]: { model: "openai/gpt-5.6-terra", variant: "high" } }),
        );
        expect(configured.agent?.[PLANNER_AGENT_ID]).toMatchObject({
            model: "openai/gpt-5.6-terra",
            variant: "high",
        });

        const fallback: Config = {};
        registerWorkflowSubagents(
            fallback,
            makeConfig({ [AGENT_IDS.planner]: { model: "   ", variant: "high" } }),
        );
        expect("model" in (fallback.agent?.[PLANNER_AGENT_ID] ?? {})).toBe(false);
        expect("variant" in (fallback.agent?.[PLANNER_AGENT_ID] ?? {})).toBe(false);
    });
});
