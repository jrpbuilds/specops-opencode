import type { Config } from "@opencode-ai/plugin";
import { describe, expect, test } from "bun:test";
import { AGENT_IDS } from "../../src/agents/ids.js";
import { FRONTIER_AGENT_ID } from "../../src/agents/frontier.js";
import { registerWorkflowSubagents } from "../../src/host/agents.js";
import { FRONTIER_PERMISSION } from "../../src/agents/permissions.js";
import { loadPrompt } from "../../src/prompts.js";
import {
    DEFAULT_AUTO_REVIEW_ITERATIONS,
    DEFAULT_SUBAGENT_CONCURRENCY,
    type SpecOpsConfig,
} from "../../src/config.js";

/** Build a complete valid role config with optional frontier overrides. */
function makeConfig(overrides: Partial<SpecOpsConfig["agents"]> = {}): SpecOpsConfig {
    const defaults = Object.fromEntries(
        Object.values(AGENT_IDS).map(id => [id, {}]),
    ) as SpecOpsConfig["agents"];
    return {
        agents: { ...defaults, ...overrides } as SpecOpsConfig["agents"],
        // Frontier registration is gated on this setting, so its definition
        // tests exercise the enabled path through the shared table.
        frontierEscalation: true,
        maxSubagentConcurrency: DEFAULT_SUBAGENT_CONCURRENCY,
        maxAutoReviewIterations: DEFAULT_AUTO_REVIEW_ITERATIONS,
    };
}

describe("frontier agent registration", () => {
    test("registers the SpecOps frontier subagent with the frontier prompt", () => {
        const config: Config = {};
        registerWorkflowSubagents(config, makeConfig());

        expect(config.agent?.[FRONTIER_AGENT_ID] as Record<string, unknown>).toEqual({
            description:
                "Advice-only consultation for genuinely difficult unresolved technical " +
                "blockers raised by SpecOps specialists. Returns technical advice only; does " +
                "not modify source, OpenSpec artifacts, tasks, workflow state, review " +
                "verdicts, or lifecycle state.",
            mode: "subagent",
            hidden: true,
            permission: FRONTIER_PERMISSION,
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

    test("frontier prompt uses the shared optional Engram policy", () => {
        const prompt = loadPrompt(AGENT_IDS.frontier);

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
    });

    test("applies configured frontier model and variant", () => {
        const config: Config = {};
        registerWorkflowSubagents(
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
        registerWorkflowSubagents(
            config,
            makeConfig({ [AGENT_IDS.frontier]: { model: "openai/gpt-5" } }),
        );

        expect(config.agent?.[FRONTIER_AGENT_ID]?.model).toBe("openai/gpt-5");
        expect("variant" in (config.agent?.[FRONTIER_AGENT_ID] ?? {})).toBe(false);
    });

    test("omits model and variant for blank model to preserve OpenCode fallback", () => {
        const config: Config = {};
        registerWorkflowSubagents(
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
        registerWorkflowSubagents(config, makeConfig());

        expect(config.agent?.build?.description).toBe("Build");
        expect(config.agent?.[AGENT_IDS.coordinator]?.description).toBe("Coordinator");
    });
});
