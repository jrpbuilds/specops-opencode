import type { Config } from "@opencode-ai/plugin";
import { describe, expect, test } from "bun:test";
import { AGENT_IDS } from "../../src/agents/ids.js";
import { IMPLEMENTER_AGENT_ID } from "../../src/agents/implementer.js";
import { registerImplementerAgent } from "../../src/host/agents.js";
import { IMPLEMENTER_PERMISSION } from "../../src/agents/permissions.js";
import { loadPrompt } from "../../src/prompts.js";
import {
    DEFAULT_AUTO_REVIEW_ITERATIONS,
    DEFAULT_SUBAGENT_CONCURRENCY,
    type SpecOpsConfig,
} from "../../src/config.js";

/** Build a complete valid role config with optional implementer overrides. */
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

describe("registerImplementerAgent", () => {
    test("registers the SpecOps implementer subagent with the implementer prompt", () => {
        const config: Config = {};
        registerImplementerAgent(config, makeConfig());

        expect(config.agent?.[IMPLEMENTER_AGENT_ID] as Record<string, unknown>).toEqual({
            description:
                "Implements approved OpenSpec tasks in source and tests, runs verification, and marks completed tasks in tasks.md. Use this agent to execute SpecOps implementation plans.",
            mode: "subagent",
            hidden: true,
            prompt: loadPrompt(AGENT_IDS.implementer),
            permission: IMPLEMENTER_PERMISSION,
        });
    });

    test("implementer registration keeps native access within the active worktree", () => {
        const config: Config = {};
        registerImplementerAgent(config, makeConfig());

        const permission = config.agent?.[IMPLEMENTER_AGENT_ID]?.permission;
        expect(permission).toBeDefined();
        expect(permission?.edit).toBe("allow");
        expect(permission?.bash).toBe("allow");
        expect(permission?.external_directory).toBe("deny");
        expect(permission?.doom_loop).toBe("allow");
    });

    test("implementer prompt owns unchecked task execution and direct source changes", () => {
        const prompt = loadPrompt(AGENT_IDS.implementer);

        expect(prompt).toContain(
            "executing the unchecked tasks in the change's tasks-mapped artifact",
        );
        expect(prompt).toContain("Inspect and modify repository source code and tests directly");
        expect(prompt).toContain("Work within the active project/worktree");
        expect(prompt).not.toContain("Do not inspect repository source code yourself");
    });

    test("implementer prompt gates task completion on verification", () => {
        const prompt = loadPrompt(AGENT_IDS.implementer);

        expect(prompt).toContain("only then change `- [ ]` to `- [x]`");
        expect(prompt).toContain("leave it unchecked");
        expect(prompt).toContain("Do not fabricate completion");
    });

    test("implementer prompt follows repository conventions and permits supporting edits", () => {
        const prompt = loadPrompt(AGENT_IDS.implementer);

        expect(prompt).toContain("repository-defined tooling");
        expect(prompt).toContain("Follow existing architecture and conventions");
        expect(prompt).toContain("smallest coherent change");
        expect(prompt).toContain("Avoid unrelated cleanup, speculative refactoring");
        expect(prompt).toContain("not an exhaustive list of every supporting edit");
        expect(prompt).toContain("add or update tests when warranted");
    });

    test("implementer maps approved behaviour to production code and meaningful evidence", () => {
        const prompt = loadPrompt(AGENT_IDS.implementer);

        expect(prompt).toContain("map each approved behaviour and design decision");
        expect(prompt).toContain("callers, surrounding contracts, lifecycle");
        expect(prompt).toContain("clean, maintainable production code");
        expect(prompt).toContain("Do not use hacks or introduce accidental complexity");
        expect(prompt).toContain("assertions must prove required behaviour");
        expect(prompt).toContain("mock away the contract under test");
        expect(prompt).toContain("proves only what it directly exercises");
    });

    test("implementer prompt preserves planning boundaries and forbids self-approval", () => {
        const prompt = loadPrompt(AGENT_IDS.implementer);

        expect(prompt).toContain("Do not silently redesign");
        expect(prompt).toContain("Do not weaken or delete tests");
        expect(prompt).toContain("Do not review or approve your own implementation");
        expect(prompt).toContain("Do not archive");
    });

    test("implementer reports planning conflicts to the coordinator and keeps checkbox workflow", () => {
        const prompt = loadPrompt(AGENT_IDS.implementer);
        expect(prompt).toContain("stop and report the conflict to the SpecOps coordinator");
        expect(prompt).toContain(
            "Do not modify `proposal.md`, capability specifications, or `design.md`",
        );
        expect(prompt).toContain("only then change `- [ ]` to `- [x]`");
        expect(prompt).toContain("Do not mark incomplete or partially completed tasks complete");
    });

    test("implementer prompt supports review remediation mode", () => {
        const prompt = loadPrompt(AGENT_IDS.implementer);

        expect(prompt).toContain("## Review remediation");
        expect(prompt).toContain("review remediation and provides reviewer FAIL findings");
        expect(prompt).toContain("## N. Review remediation");
        expect(prompt).toContain("reuse still-unchecked items rather than appending a new one");
        expect(prompt).toContain("`- [ ] N.x Resolve reviewer finding Fx:");
        expect(prompt).toContain("Do not uncheck any completed task");
        expect(prompt).toContain("Append the remediation items before you modify source or tests");
        expect(prompt).toContain("smallest coherent source and test changes");
        expect(prompt).toContain("Do not expand scope beyond the approved proposal");
        expect(prompt).toContain("change its item to `- [x]` only after you have verified");
        expect(prompt).toContain("Run `openspec validate <change>` after remediation changes");
        expect(prompt).toContain("cannot be resolved without changing approved requirements");
        expect(prompt).toContain("Leave that item unchecked and return the conflict");
    });

    test("implementer remediation targets root causes and checks regressions", () => {
        const prompt = loadPrompt(AGENT_IDS.implementer);

        expect(prompt).toContain("Fix the underlying cause");
        expect(prompt).toContain("every canonical `F1..Fn` independently traceable");
        expect(prompt).toContain("verified it independently");
        expect(prompt).toContain("Inspect the remediation delta for regressions");
        expect(prompt).toContain("do not independently redesign approved work");
    });

    test("applies configured implementer model and variant", () => {
        const config: Config = {};
        registerImplementerAgent(
            config,
            makeConfig({
                [AGENT_IDS.implementer]: {
                    model: "openai/gpt-5.6-terra",
                    variant: "high",
                },
            }),
        );

        expect(config.agent?.[IMPLEMENTER_AGENT_ID]).toMatchObject({
            model: "openai/gpt-5.6-terra",
            variant: "high",
        });
    });

    test("applies model without variant when only model is configured", () => {
        const config: Config = {};
        registerImplementerAgent(
            config,
            makeConfig({ [AGENT_IDS.implementer]: { model: "openai/gpt-5" } }),
        );

        expect(config.agent?.[IMPLEMENTER_AGENT_ID]?.model).toBe("openai/gpt-5");
        expect("variant" in (config.agent?.[IMPLEMENTER_AGENT_ID] ?? {})).toBe(false);
    });

    test("omits model and variant for blank model to preserve OpenCode fallback", () => {
        const config: Config = {};
        registerImplementerAgent(
            config,
            makeConfig({ [AGENT_IDS.implementer]: { model: "   ", variant: "high" } }),
        );

        expect("model" in (config.agent?.[IMPLEMENTER_AGENT_ID] ?? {})).toBe(false);
        expect("variant" in (config.agent?.[IMPLEMENTER_AGENT_ID] ?? {})).toBe(false);
    });

    test("does not modify existing agents including the planning specialists", () => {
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
                [AGENT_IDS.designer]: {
                    description: "Designer",
                    mode: "subagent",
                    prompt: "Designer prompt",
                },
            },
        };
        registerImplementerAgent(config, makeConfig());

        expect(config.agent?.build?.description).toBe("Build");
        expect(config.agent?.[AGENT_IDS.coordinator]?.description).toBe("Coordinator");
        expect(config.agent?.[AGENT_IDS.explorer]?.description).toBe("Explorer");
        expect(config.agent?.[AGENT_IDS.planner]?.description).toBe("Planner");
        expect(config.agent?.[AGENT_IDS.designer]?.description).toBe("Designer");
    });

    test("implementer prompt returns the standard handoff envelope and keeps special modes standalone", () => {
        const prompt = loadPrompt(AGENT_IDS.implementer);

        expect(prompt).toContain("## Handoff");
        expect(prompt).toContain("STATUS: success | blocked");
        expect(prompt).toContain("SUMMARY:");
        expect(prompt).toContain("ARTIFACTS:");
        expect(prompt).toContain("VERIFICATION:");
        expect(prompt).toContain("RISKS:");
        expect(prompt).toContain("NEXT:");
        expect(prompt).toContain("never ordinary changed source or test files");
        expect(prompt).toContain("For ARTIFACTS, list only durable workflow artifacts");
        expect(prompt).toContain(
            "return a concise summary to the SpecOps coordinator in the standard SpecOps handoff envelope (see ## Handoff), reporting ordinary changed source and test files in SUMMARY",
        );
        expect(prompt).toContain("`FRONTIER ELIGIBLE BLOCKER`, return that block alone");
        expect(prompt).not.toContain("`USER DECISION REQUIRED`, return that block alone");
    });

    test("implementer prompt treats Project Context as orientation, not a substitute", () => {
        const prompt = loadPrompt(AGENT_IDS.implementer);

        expect(prompt).toContain("## Project Context");
        expect(prompt).toContain("use it as orientation");
        expect(prompt).toContain("not a substitute for inspecting");
        expect(prompt).toContain("the repository wins");
        expect(prompt).toContain("Do not change scope beyond the approved OpenSpec artifacts");
    });

    test("implementer prompt uses the shared optional Engram policy", () => {
        const prompt = loadPrompt(AGENT_IDS.implementer);

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

    test("implementer prompt defines Frontier-eligible blocker request and resume behaviour", () => {
        const prompt = loadPrompt(AGENT_IDS.implementer);

        const section = prompt.slice(prompt.indexOf("## Frontier escalation"));

        expect(prompt).toContain("## Frontier escalation");
        expect(section).toContain("FRONTIER ELIGIBLE BLOCKER");
        expect(section).toContain(
            "Do not report a Frontier-eligible blocker for missing repository evidence",
        );
        expect(section).toContain("product or requirements decisions needing user input");
        expect(section).toContain("routine implementation errors");
        expect(section).toContain("test failures");
        expect(section).toContain("resume the same task/pass");
        expect(section).toContain("Frontier advice is advisory only");
        expect(section).toContain("leave the item unchecked and return the conflict");
    });
});
