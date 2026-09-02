import type { Config } from "@opencode-ai/plugin";
import { describe, expect, test } from "bun:test";
import { AGENT_IDS } from "../../src/agents/ids.js";
import { EXPLORER_AGENT_ID } from "../../src/agents/explorer.js";
import { registerWorkflowSubagents } from "../../src/host/agents.js";
import { EXPLORER_PERMISSION } from "../../src/agents/permissions.js";
import { loadPrompt } from "../../src/prompts.js";
import {
    DEFAULT_AUTO_REVIEW_ITERATIONS,
    DEFAULT_IMPLEMENTER_FANOUT,
    DEFAULT_REVIEW_FANOUT,
    DEFAULT_SUBAGENT_CONCURRENCY,
    type SpecOpsConfig,
} from "../../src/config.js";

/** Build a complete valid role config with optional explorer overrides. */
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

describe("explorer agent registration", () => {
    test("registers the SpecOps explorer subagent with the explorer prompt", () => {
        const config: Config = {};
        registerWorkflowSubagents(config, makeConfig());

        expect(config.agent?.[EXPLORER_AGENT_ID] as Record<string, unknown>).toEqual({
            description:
                "Investigates repository source, behavior, conventions, tests, constraints, and risks for planning and design. Use when the SpecOps coordinator needs focused repository evidence.",
            mode: "subagent",
            hidden: true,
            permission: EXPLORER_PERMISSION,
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

    test("explorer follows a lightweight evidence path and labels uncertainty", () => {
        const prompt = loadPrompt(AGENT_IDS.explorer);

        expect(prompt).toContain(
            "entrypoint → callers/dependencies → data/control flow → relevant contracts → tests/tooling → repository conventions → uncertainty",
        );
        expect(prompt).toContain("stopping when the evidence is sufficient and proportional");
        expect(prompt).toContain("Clearly label inference, missing evidence");
    });

    test("explorer prompt returns the standard handoff envelope before its findings", () => {
        const prompt = loadPrompt(AGENT_IDS.explorer);

        expect(prompt).toContain("## Handoff");
        expect(prompt).toContain("STATUS: success | blocked");
        expect(prompt).toContain("SUMMARY:");
        expect(prompt).toContain("ARTIFACTS:");
        expect(prompt).toContain("VERIFICATION:");
        expect(prompt).toContain("RISKS:");
        expect(prompt).toContain("NEXT:");
        expect(prompt).toContain("never ordinary changed source or test files");
        expect(prompt).toContain("`NEXT` is advisory only and never overrides");
    });

    test("explorer prompt returns a scoped PROJECT CONTEXT capsule before its findings", () => {
        const prompt = loadPrompt(AGENT_IDS.explorer);

        expect(prompt).toContain("## Project Context");
        expect(prompt).toContain("PROJECT CONTEXT");
        expect(prompt).toContain("Stack:");
        expect(prompt).toContain("Architecture:");
        expect(prompt).toContain("Conventions:");
        expect(prompt).toContain("Tooling:");
        expect(prompt).toContain("Constraints:");
        expect(prompt).toContain("Evidence:");
        expect(prompt).toContain("scoped strictly to the current change");
        expect(prompt).toContain("materially affect planning, design, implementation, or review");
        expect(prompt).toContain("`(inferred)`");
        expect(prompt).toContain("Omit any field with no material content");
        expect(prompt).toContain("Do not duplicate OpenSpec requirements or specifications");
        expect(prompt).toContain("repository-defined verification commands");
        expect(prompt).toContain("first return a PROJECT CONTEXT block");
    });

    test("applies configured explorer model and variant", () => {
        const config: Config = {};
        registerWorkflowSubagents(
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
        registerWorkflowSubagents(
            config,
            makeConfig({ [AGENT_IDS.explorer]: { model: "openai/gpt-5" } }),
        );

        expect(config.agent?.[EXPLORER_AGENT_ID]?.model).toBe("openai/gpt-5");
        expect("variant" in (config.agent?.[EXPLORER_AGENT_ID] ?? {})).toBe(false);
    });

    test("omits model and variant for blank model to preserve OpenCode fallback", () => {
        const config: Config = {};
        registerWorkflowSubagents(
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
        registerWorkflowSubagents(config, makeConfig());

        expect(config.agent?.build?.description).toBe("Build");
        expect(config.agent?.[AGENT_IDS.coordinator]?.description).toBe("Coordinator");
    });

    test("explorer prompt does not mention Frontier escalation", () => {
        const prompt = loadPrompt(AGENT_IDS.explorer);

        expect(prompt).not.toContain("Frontier");
        expect(prompt).not.toContain("specops-frontier");
        expect(prompt).not.toContain("FRONTIER ELIGIBLE BLOCKER");
    });

    test("explorer prompt uses the shared optional Engram policy", () => {
        const prompt = loadPrompt(AGENT_IDS.explorer);

        expect(prompt).toContain("## Engram");
        expect(prompt).toContain(
            "If Engram memory tools are available, you may use them when historical project knowledge would materially improve your pass.",
        );
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
        expect(prompt).not.toContain("## Historical project memory (Engram, optional)");
        expect(prompt).not.toContain("mem_");
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
        expect(prompt).not.toContain("Stage 1 is read-only");
        expect(prompt).not.toContain("Explorer's responsibility only");
    });

    test("explorer memory guidance stays orientation-only and evidence-grounded", () => {
        const prompt = loadPrompt(AGENT_IDS.explorer);

        expect(prompt).toContain("## Memory orientation");
        expect(prompt).toContain(
            "prior architectural discoveries, conventions, subsystem relationships, and investigation areas as leads",
        );
        expect(prompt).toContain(
            "Ground every finding in current repository evidence before it enters the findings",
        );
        expect(prompt).toContain("memory never substitutes for direct inspection");
    });
});
