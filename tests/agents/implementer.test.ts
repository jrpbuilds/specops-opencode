import type { Config } from "@opencode-ai/plugin";
import { describe, expect, test } from "bun:test";
import { AGENT_IDS } from "../../src/agents/ids.js";
import { IMPLEMENTER_AGENT_ID } from "../../src/agents/implementer.js";
import { IMPLEMENTER_PERMISSION } from "../../src/agents/permissions.js";
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

describe("implementer agent", () => {
    test("registers the implementer with worktree permissions and its prompt", () => {
        const config: Config = {};
        registerWorkflowSubagents(config, makeConfig());

        expect(config.agent?.[IMPLEMENTER_AGENT_ID] as Record<string, unknown>).toEqual({
            description:
                "Implements approved OpenSpec tasks in source and tests, runs verification, and marks completed tasks in tasks.md. Use this agent to execute SpecOps implementation plans.",
            mode: "subagent",
            hidden: true,
            prompt: loadPrompt(AGENT_IDS.implementer),
            permission: IMPLEMENTER_PERMISSION,
        });

        const permission = config.agent?.[IMPLEMENTER_AGENT_ID]?.permission;
        expect(permission?.edit).toBe("allow");
        expect(permission?.bash).toBe("allow");
        expect(permission?.external_directory).toBe("deny");
    });

    test("keeps direct implementation and approved-scope contracts", () => {
        const prompt = loadPrompt(AGENT_IDS.implementer);

        expect(prompt).toContain("Execute the approved OpenSpec task scope");
        expect(prompt).toContain("repository source and tests directly");
        expect(prompt).toContain("Follow the approved requirements, design");
        expect(prompt).toContain("smallest coherent change");
        expect(prompt).toContain("Do not silently redesign approved requirements or design");
        expect(prompt).toContain("report it to the Orchestrator");
        expect(prompt).not.toContain("Do not inspect repository source yourself");
    });

    test("makes assignedTaskIds the complete scoped assignment without scheduler prose", () => {
        const prompt = loadPrompt(AGENT_IDS.implementer);

        expect(prompt).toContain("work only those ids in dependency order");
        expect(prompt).toMatch(/targeted single-line edit from\s+`- \[ \]` to `- \[x\]`/);
        expect(prompt).toContain("When no `assignedTaskIds` is supplied");
        expect(prompt).not.toContain("maxSubagentConcurrency");
        expect(prompt).not.toContain("lane scheduling");
        expect(prompt).not.toContain("specops_progress");
    });

    test("ties completion to meaningful verification and reports blockers", () => {
        const prompt = loadPrompt(AGENT_IDS.implementer);

        expect(prompt).toMatch(/only then check the\s+task off/);
        expect(prompt).toContain("Assertions must prove required behaviour");
        expect(prompt).toContain("Do not mark incomplete");
        expect(prompt).toContain("partially completed work");
        expect(prompt).toMatch(/do not fabricate\s+completion/);
        expect(prompt).toContain("Do not weaken or delete tests");
        expect(prompt).toMatch(/Do not review or approve your own\s+implementation/);
        expect(prompt).toContain("Do not archive the OpenSpec change");
    });

    test("supports review remediation without creating a second workflow manual", () => {
        const prompt = loadPrompt(AGENT_IDS.implementer);

        expect(prompt).toContain("## Review remediation");
        expect(prompt).toContain("Reviewer FAIL findings");
        expect(prompt).toContain("## N. Review remediation");
        expect(prompt).toContain("Resolve reviewer finding Fx");
        expect(prompt).toContain("preserving all completed tasks");
        expect(prompt).toContain("F1..Fn");
        expect(prompt).toContain("independently traceable");
        expect(prompt).toContain("openspec validate <change>");
        expect(prompt).toMatch(/leave the item\s+unchecked/);
        expect(prompt).toContain("changing approved requirements or design");
    });

    test("keeps settled verification, handoff, context, and Frontier boundaries", () => {
        const prompt = loadPrompt(AGENT_IDS.implementer);

        expect(prompt).toContain("## Settled integrated verification");
        expect(prompt).toContain("verification is your entire assignment");
        expect(prompt).toContain("never prior summaries");
        expect(prompt).toContain("Report every check that ran, passed, failed");
        expect(prompt).toMatch(/This is\s+report-only/);
        expect(prompt).toContain("## Handoff");
        expect(prompt).toContain("STATUS: success | blocked");
        expect(prompt).toMatch(/ordinary changed source and test\s+files in `SUMMARY`/);
        expect(prompt).toContain("## Project Context");
        expect(prompt).toMatch(/not a substitute for\s+direct inspection/);
        expect(prompt).toContain("## Frontier escalation");
        expect(prompt).toContain("FRONTIER ELIGIBLE BLOCKER");
        expect(prompt).toContain("resume the same task/pass");
        expect(prompt).toContain("## Engram");
        expect(prompt).not.toContain("mem_");
    });

    test("applies configured implementer model and preserves fallback semantics", () => {
        const configured: Config = {};
        registerWorkflowSubagents(
            configured,
            makeConfig({
                [AGENT_IDS.implementer]: { model: "openai/gpt-5.6-terra", variant: "high" },
            }),
        );
        expect(configured.agent?.[IMPLEMENTER_AGENT_ID]).toMatchObject({
            model: "openai/gpt-5.6-terra",
            variant: "high",
        });

        const fallback: Config = {};
        registerWorkflowSubagents(
            fallback,
            makeConfig({ [AGENT_IDS.implementer]: { model: "   ", variant: "high" } }),
        );
        expect("model" in (fallback.agent?.[IMPLEMENTER_AGENT_ID] ?? {})).toBe(false);
        expect("variant" in (fallback.agent?.[IMPLEMENTER_AGENT_ID] ?? {})).toBe(false);
    });
});
