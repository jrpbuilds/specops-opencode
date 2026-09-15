import type { Config } from "@opencode-ai/plugin";
import { describe, expect, test } from "bun:test";
import { DESIGNER_AGENT_ID } from "../../src/agents/designer.js";
import { AGENT_IDS } from "../../src/agents/ids.js";
import { DESIGNER_PERMISSION } from "../../src/agents/permissions.js";
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

describe("designer agent", () => {
    test("registers the designer with its role prompt and permission policy", () => {
        const config: Config = {};
        registerWorkflowSubagents(config, makeConfig());

        expect(config.agent?.[DESIGNER_AGENT_ID] as Record<string, unknown>).toEqual({
            description:
                "Authors the technical OpenSpec design from approved requirements and repository evidence. Use this agent to create design.md for SpecOps changes.",
            mode: "subagent",
            hidden: true,
            permission: DESIGNER_PERMISSION,
            prompt: loadPrompt(AGENT_IDS.designer),
        });
    });

    test("uses the dispatched design responsibility and preserves planning boundaries", () => {
        const prompt = loadPrompt(AGENT_IDS.designer);

        expect(prompt).toContain("design-role artifact named by");
        expect(prompt).toContain("current dispatch");
        expect(prompt).toMatch(/artifact id, output\s+path/);
        expect(prompt).toContain("openspec instructions <artifact-id> --change <change>");
        expect(prompt).toContain("Follow the active OpenSpec schema and template exactly");
        expect(prompt).toMatch(/do not\s+inspect repository source yourself/i);
        expect(prompt).toMatch(/request a\s+focused Explorer follow-up/);
        expect(prompt).toContain("Do not modify requirements-role artifacts");
        expect(prompt).toMatch(/author task-planning artifacts, or\s+implement source changes/);
    });

    test("keeps proportional design judgement and material dimensions", () => {
        const prompt = loadPrompt(AGENT_IDS.designer);

        expect(prompt).toContain("simplest robust");
        expect(prompt).toContain("coherent with the existing system");
        expect(prompt).toContain("interfaces, behavioural contracts, data flow, and control flow");
        expect(prompt).toContain("state ownership, lifecycle, and consistency");
        expect(prompt).toContain("failure and partial-failure behaviour");
        expect(prompt).toContain("concurrency, retries, and idempotency");
        expect(prompt).toContain("rollout, rollback, recovery, and testing implications");
        expect(prompt).toContain("Omit irrelevant dimensions");
        expect(prompt).toContain("Do not add layers, abstractions, extension points");
        expect(prompt).not.toContain("createRollingScheduler");
        expect(prompt).not.toContain("maxSubagentConcurrency");
    });

    test("escalates only materially different technical decisions", () => {
        const prompt = loadPrompt(AGENT_IDS.designer);

        expect(prompt).toContain("## Material technical decisions");
        expect(prompt).toContain("materially different architectures");
        expect(prompt).toContain("USER DECISION REQUIRED");
        expect(prompt).toContain("Every option must satisfy the approved requirements");
        expect(prompt).toContain("Do not modify requirements-role artifacts");
        expect(prompt).toContain("## Open Questions");
        expect(prompt).toContain("deferrable Open Question");
        expect(prompt).toContain("blocking decision");
        expect(prompt).toContain("No blocking Open Question may survive into `tasks.md`");
    });

    test("preserves revision, validation, handoff, and Frontier behavior", () => {
        const prompt = loadPrompt(AGENT_IDS.designer);

        expect(prompt).toContain("`revisionTarget`");
        expect(prompt).toContain("`upstreamFeedback`");
        expect(prompt).toContain("revise only affected design decisions");
        expect(prompt).toContain("preserve the rest");
        expect(prompt).toContain("Run `openspec validate <change>` after authoring");
        expect(prompt).toContain("## Handoff");
        expect(prompt).toContain("STATUS: success | blocked");
        expect(prompt).toContain("## Project Context");
        expect(prompt).toContain("not authority");
        expect(prompt).toContain("## Frontier escalation");
        expect(prompt).toContain("FRONTIER ELIGIBLE BLOCKER");
        expect(prompt).toContain("resume the same pass");
        expect(prompt).toContain("## Engram");
        expect(prompt).not.toContain("mem_");
    });

    test("applies configured designer model and preserves fallback semantics", () => {
        const configured: Config = {};
        registerWorkflowSubagents(
            configured,
            makeConfig({
                [AGENT_IDS.designer]: { model: "openai/gpt-5.6-terra", variant: "high" },
            }),
        );
        expect(configured.agent?.[DESIGNER_AGENT_ID]).toMatchObject({
            model: "openai/gpt-5.6-terra",
            variant: "high",
        });

        const fallback: Config = {};
        registerWorkflowSubagents(
            fallback,
            makeConfig({ [AGENT_IDS.designer]: { model: "   ", variant: "high" } }),
        );
        expect("model" in (fallback.agent?.[DESIGNER_AGENT_ID] ?? {})).toBe(false);
        expect("variant" in (fallback.agent?.[DESIGNER_AGENT_ID] ?? {})).toBe(false);
    });
});
