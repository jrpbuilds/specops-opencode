import type { Config } from "@opencode-ai/plugin";
import { describe, expect, test } from "bun:test";
import { AGENT_IDS } from "../../src/agents/ids.js";
import { DESIGNER_AGENT_ID } from "../../src/agents/designer.js";
import { registerWorkflowSubagents } from "../../src/host/agents.js";
import { DESIGNER_PERMISSION } from "../../src/agents/permissions.js";
import { loadPrompt } from "../../src/prompts.js";
import {
    DEFAULT_AUTO_REVIEW_ITERATIONS,
    DEFAULT_SUBAGENT_CONCURRENCY,
    type SpecOpsConfig,
} from "../../src/config.js";

/** Build a complete valid role config with optional designer overrides. */
function makeConfig(overrides: Partial<SpecOpsConfig["agents"]> = {}): SpecOpsConfig {
    const defaults = Object.fromEntries(
        Object.values(AGENT_IDS).map(id => [id, {}]),
    ) as SpecOpsConfig["agents"];
    return {
        agents: { ...defaults, ...overrides } as SpecOpsConfig["agents"],
        frontierEscalation: false,
        maxSubagentConcurrency: DEFAULT_SUBAGENT_CONCURRENCY,
        maxAutoReviewIterations: DEFAULT_AUTO_REVIEW_ITERATIONS,
    };
}

describe("designer agent registration", () => {
    test("registers the SpecOps designer subagent with the designer prompt", () => {
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

    test("designer prompt forbids source exploration, task authoring, and implementation", () => {
        const prompt = loadPrompt(AGENT_IDS.designer);

        expect(prompt).toContain("Do not inspect repository source code yourself");
        expect(prompt).toContain("Do not modify requirements-role artifacts");
        expect(prompt).toContain("stop and report it to the coordinator for resolution");
        expect(prompt).toContain("Do not author task-planning artifacts");
        expect(prompt).toContain("Do not implement source changes");
        expect(prompt).toContain("`design.md` proportional to the change");
        expect(prompt).toContain(
            "If the coordinator explicitly returns the dispatched design-role artifact for revision after an upstream change",
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
        expect(prompt).toContain("put the recommended option first in `Options`");
        expect(prompt).toContain("Every option must satisfy the approved requirements");
        expect(prompt).toContain(
            "Do not ask the coordinator to generate, merge, remove, or rank options",
        );
        expect(prompt).toContain("new USER DECISION REQUIRED request");
        expect(prompt).toContain("Do not persist the question or answer");
    });

    test("designer selects only material dimensions and the simplest robust solution", () => {
        const prompt = loadPrompt(AGENT_IDS.designer);

        expect(prompt).toContain("simplest robust solution coherent with the existing system");
        expect(prompt).toContain("interfaces and behavioural contracts; data and control flow");
        expect(prompt).toContain("state ownership, lifecycle, and consistency");
        expect(prompt).toContain("failure and partial-failure behaviour");
        expect(prompt).toContain("concurrency, retries, and idempotency");
        expect(prompt).toContain("operational rollout, rollback, and recovery");
        expect(prompt).toContain("Omit irrelevant dimensions");
        expect(prompt).toContain("do not add layers, abstractions, extension points");
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

        expect(prompt).toContain("Do not modify requirements-role artifacts");
        expect(prompt).toContain("reported to the coordinator as a conflict for Planner routing");
    });

    test("designer honors revision dispatch metadata while preserving unaffected decisions", () => {
        const prompt = loadPrompt(AGENT_IDS.designer);
        const start = prompt.indexOf("A revision dispatch");
        const section = prompt.slice(
            start,
            prompt.indexOf("Do not author task-planning artifacts", start),
        );
        expect(section).toContain("`revisionTarget`");
        expect(section).toContain("`upstreamFeedback`");
        expect(section).toContain("revise only the affected design decisions");
        expect(section).toContain("preserve the rest");
        expect(section).toContain("preservation clause below");
    });

    test("applies configured designer model and variant", () => {
        const config: Config = {};
        registerWorkflowSubagents(
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
        registerWorkflowSubagents(
            config,
            makeConfig({ [AGENT_IDS.designer]: { model: "openai/gpt-5" } }),
        );

        expect(config.agent?.[DESIGNER_AGENT_ID]?.model).toBe("openai/gpt-5");
        expect("variant" in (config.agent?.[DESIGNER_AGENT_ID] ?? {})).toBe(false);
    });

    test("omits model and variant for blank model to preserve OpenCode fallback", () => {
        const config: Config = {};
        registerWorkflowSubagents(
            config,
            makeConfig({ [AGENT_IDS.designer]: { model: "   ", variant: "high" } }),
        );

        expect("model" in (config.agent?.[DESIGNER_AGENT_ID] ?? {})).toBe(false);
        expect("variant" in (config.agent?.[DESIGNER_AGENT_ID] ?? {})).toBe(false);
    });

    test("does not modify existing unrelated agents", () => {
        const config: Config = {
            agent: {
                build: { description: "Build", mode: "primary", prompt: "Build prompt" },
                [AGENT_IDS.coordinator]: {
                    description: "Coordinator",
                    mode: "primary",
                    prompt: "Coordinator prompt",
                },
                "custom-research": {
                    description: "Research",
                    mode: "subagent",
                    prompt: "Research prompt",
                },
                "custom-planning": {
                    description: "Planning",
                    mode: "subagent",
                    prompt: "Planning prompt",
                },
            },
        };
        registerWorkflowSubagents(config, makeConfig());

        expect(config.agent?.build?.description).toBe("Build");
        expect(config.agent?.[AGENT_IDS.coordinator]?.description).toBe("Coordinator");
        expect(config.agent?.["custom-research"]?.description).toBe("Research");
        expect(config.agent?.["custom-planning"]?.description).toBe("Planning");
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

    test("designer prompt uses the shared optional Engram policy", () => {
        const prompt = loadPrompt(AGENT_IDS.designer);

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
        expect(prompt).toContain("Write SpecOps memory at project scope, never personal scope.");
        expect(prompt).toContain(
            "Where the tooling supports a `topic_key`, use `change/<change-name>/<subject>` so same-subject breadcrumbs update in place while distinct subjects stay distinct; never use one key for the whole change.",
        );
        expect(prompt).toContain(
            "Read memory only when it would materially improve the pass, chiefly when resuming the same active change",
        );
        expect(prompt).toContain(
            "Treat results as leads to verify against current approved artifacts, repository state, and executed evidence, never facts.",
        );
        expect(prompt).toContain(
            "Write only durably useful context for whoever works the change next",
        );
        expect(prompt).toContain(
            "If nothing durable was learned, write nothing; a pass without a write is complete and writes are never required.",
        );
        expect(prompt).toContain("Workflow state includes:");
        expect(prompt).toContain(
            "run-scoped capsules — the Project Context capsule and the Todo projection.",
        );
        expect(prompt).toContain(
            "proposal, specs, design, and tasks content is never copied into memory — only context about it.",
        );
        expect(prompt).not.toContain("mem_");
        expect(prompt).not.toContain("Do not call any Engram");
        expect(prompt).not.toContain("the Explorer owns Engram retrieval");
    });

    test("designer memory guidance informs decisions without constraining approved evidence", () => {
        const prompt = loadPrompt(AGENT_IDS.designer);

        expect(prompt).toContain("## Memory orientation");
        expect(prompt).toContain("may read prior decision/constraint breadcrumbs as background");
        expect(prompt).toContain("(terminology, prior architecture, conventions)");
        expect(prompt).toContain(
            "never substitute for the user's goal, approved artifacts, or explorer evidence",
        );
        expect(prompt).toContain("never recover lifecycle state");
        expect(prompt).toContain(
            "Current requirements and repository evidence remain authoritative.",
        );
        expect(prompt).toContain("write a concise breadcrumb for a material decision's rationale");
        expect(prompt).toContain("never copy artifact content into memory");
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
