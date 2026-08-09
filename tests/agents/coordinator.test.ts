import type { Config } from "@opencode-ai/plugin";
import { describe, expect, test } from "bun:test";
import { AGENT_IDS } from "../../src/agents/ids.js";
import { registerCoordinatorAgent, SPECOPS_AGENT_ID } from "../../src/agents/coordinator.js";
import { loadPrompt } from "../../src/prompts.js";
import type { SpecOpsConfig } from "../../src/config.js";

/** Build a complete valid role config with optional coordinator overrides. */
function makeConfig(overrides: Partial<SpecOpsConfig["agents"]> = {}): SpecOpsConfig {
    const defaults = Object.fromEntries(
        Object.values(AGENT_IDS).map(id => [id, {}]),
    ) as SpecOpsConfig["agents"];
    return {
        agents: { ...defaults, ...overrides } as SpecOpsConfig["agents"],
        frontierEscalation: false,
    };
}

describe("registerCoordinatorAgent", () => {
    test("registers the SpecOps primary agent with the coordinator prompt", () => {
        const config: Config = {};
        registerCoordinatorAgent(config, makeConfig());

        expect(config.agent?.[SPECOPS_AGENT_ID]).toMatchObject({
            description: "SpecOps coordinator for spec-driven development",
            mode: "primary",
            prompt: loadPrompt(AGENT_IDS.coordinator),
        });
        expect(
            (config.agent?.[SPECOPS_AGENT_ID]?.permission as { question?: "allow" } | undefined)
                ?.question,
        ).toBe("allow");
    });

    test("coordinator prompt delegates source-code exploration to specops-explorer", () => {
        const prompt = loadPrompt(AGENT_IDS.coordinator);

        expect(prompt).toContain("specops-explorer");
        expect(prompt).toContain("Do not read source files");
    });

    test("coordinator prompt resumes from OpenSpec state and escalates without taking over", () => {
        const prompt = loadPrompt(AGENT_IDS.coordinator);

        expect(prompt).toContain("At the start and after each specialist handoff");
        expect(prompt).toContain("when all tasks are already checked");
        expect(prompt).toContain("dispatch a focused follow-up to `specops-explorer`");
        expect(prompt).toContain("do not resolve it by taking over specialist work");
        expect(prompt).toContain("openspec <command> --help");
    });

    test("coordinator prompt uses deterministic startup context and owns decisions", () => {
        const prompt = loadPrompt(AGENT_IDS.coordinator);

        expect(prompt).toContain("## Startup");
        expect(prompt).toContain("call `specops_context` once");
        expect(prompt).toContain("Do not manually crawl the filesystem");
        expect(prompt).toContain("deprecated `openspec change list`");
        expect(prompt).toContain("If `available` is `false`");
        expect(prompt).toContain("If `error` is present");
        expect(prompt).toContain("failed or malformed lookup");
        expect(prompt).toContain("If `initialized` is `false`");
        expect(prompt).toContain("reason over `activeChanges`");
        expect(prompt).toContain("relevant active change should be resumed or a new change");
        expect(prompt).toContain("resume it and do not create a duplicate");
        expect(prompt).toContain("Create only when no relevant active change exists");
        expect(prompt).toContain("call `specops_create_change`");
        expect(prompt).toContain("After resuming or successfully creating the change");
        expect(prompt).toContain("specops_context` reports deterministic facts only");
        expect(prompt).toContain("does not match changes");
        expect(prompt).toContain("specops_create_change` creates only the name you provide");
    });

    test("coordinator prompt owns the user-decision escalation gateway", () => {
        const prompt = loadPrompt(AGENT_IDS.coordinator);

        expect(prompt).toContain("## User-decision escalation from specialists");
        expect(prompt).toContain(
            "Only `specops-planner` and `specops-designer` may return a USER DECISION REQUIRED request",
        );
        expect(prompt).toContain("do not guess the answer");
        expect(prompt).toContain("do not take over the specialist's work");
        expect(prompt).toContain("invoke OpenCode's native `question` tool");
        expect(prompt).toContain("exactly one single-select question");
        expect(prompt).toContain("Omit `multiple`");
        expect(prompt).toContain("faithfully from the specialist's request");
        expect(prompt).toContain("Do not merge, remove, rank, or invent options");
        expect(prompt).toContain("2–4 materially distinct options");
        expect(prompt).toContain("(recommended)");
        expect(prompt).toContain("Do not pre-select, reorder, or hide alternatives");
        expect(prompt).toContain("re-dispatch the **same specialist**");
        expect(prompt).toContain("resume the same pass and same artifact");
        expect(prompt).toContain("Do not persist the question or answer");
        expect(prompt).toContain("never batch multiple decisions");
    });

    test("coordinator prompt preserves native custom answers and conflict routing", () => {
        const prompt = loadPrompt(AGENT_IDS.coordinator);

        expect(prompt).toContain("custom answer");
        expect(prompt).toContain("pass it through verbatim");
        expect(prompt).toContain('not "A"/"B"');
        expect(prompt).toContain('do not add a "none of the above" option yourself');
        expect(prompt).toContain("internal or artifact conflict");
        expect(prompt).toContain("materially conflicting user requirements or constraints");
        expect(prompt).toContain("ensure Planner returns it as USER DECISION REQUIRED");
    });

    test("coordinator prompt delegates proposal/spec authoring to specops-planner", () => {
        const prompt = loadPrompt(AGENT_IDS.coordinator);

        expect(prompt).toContain("specops-planner");
        expect(prompt).toContain("Do not author OpenSpec `proposal.md`");
        expect(prompt).toContain("current OpenSpec change name");
        expect(prompt).toContain("relevant findings returned by `specops-explorer`");
    });

    test("coordinator prompt delegates design authoring to specops-designer", () => {
        const prompt = loadPrompt(AGENT_IDS.coordinator);

        expect(prompt).toContain("specops-designer");
        expect(prompt).toContain("Do not author OpenSpec `design.md`");
        expect(prompt).toContain("current OpenSpec change name");
        expect(prompt).toContain("relevant findings returned by `specops-explorer`");
    });

    test("coordinator prompt delegates tasks.md authoring to specops-planner", () => {
        const prompt = loadPrompt(AGENT_IDS.coordinator);

        expect(prompt).toContain("specops-planner");
        expect(prompt).toContain("Do not author OpenSpec `tasks.md`");
        expect(prompt).toContain("current OpenSpec change name");
        expect(prompt).toContain("relevant findings returned by `specops-explorer`");
    });

    test("coordinator prompt delegates implementation and reports incomplete tasks", () => {
        const prompt = loadPrompt(AGENT_IDS.coordinator);

        expect(prompt).toContain("delegate implementation to `specops-implementer`");
        expect(prompt).toContain("updated `tasks.md` task state");
        expect(prompt).toContain("remaining unchecked tasks or blockers");
        expect(prompt).toContain("Do not perform the final implementation review yourself");
        expect(prompt).toContain("Do not implement source changes yourself");
    });

    test("coordinator prompt delegates independent review and shows a post-review checkpoint", () => {
        const prompt = loadPrompt(AGENT_IDS.coordinator);

        expect(prompt).toContain("delegate independent verification to `specops-reviewer`");
        expect(prompt).toContain("Implementer's returned summary");
        expect(prompt).toContain("remaining unchecked tasks or blockers");
        expect(prompt).toContain("Reviewer is responsible only for PASS/FAIL and evidence");
        expect(prompt).toContain("when a resumed change already has all tasks checked");
        expect(prompt).not.toContain("If no review specialist is available");

        expect(prompt).toContain("## Review completion");
        expect(prompt).toContain("MUST invoke OpenCode's native `question` tool");
        expect(prompt).toContain("Do not print the lifecycle options as ordinary assistant text");
        expect(prompt).toContain(
            "Do not emulate the selector with Markdown, bullets, numbered choices, or prose",
        );
        expect(prompt).toContain("Do not ask the user to type a choice");
        expect(prompt).toContain("Wait for the `question` tool result");
        expect(prompt).toContain("Never substitute a textual list for the required tool call");
        expect(prompt).toContain('"questions"');
        expect(prompt).toContain('"header"');
        expect(prompt).toContain('"question"');
        expect(prompt).toContain('"options"');
        expect(prompt).toContain('"label"');
        expect(prompt).toContain('"description"');
        expect(prompt).toContain("Omit `multiple`");
        expect(prompt).toContain("The user's selection is the archive confirmation");
        expect(prompt).toContain("specops_archive");
        expect(prompt).toContain("Do not retry");
        expect(prompt).toContain("filesystem fallback");
        expect(prompt).toContain("Do not persist the user's choice anywhere");

        const completionSection = prompt.slice(prompt.indexOf("## Review completion"));

        const passSection = completionSection.slice(
            completionSection.indexOf("For PASS"),
            completionSection.indexOf("For FAIL"),
        );
        expect(passSection).toContain("Review passed");
        expect(passSection).toContain(
            "The change passed independent review. What would you like to do?",
        );
        expect(passSection.indexOf("Complete and archive")).toBeLessThan(
            passSection.indexOf("Leave open"),
        );
        expect(passSection).toContain("Finish the change and archive it in OpenSpec.");
        expect(passSection).toContain("Keep the completed change open without archiving it.");

        const failSection = completionSection.slice(completionSection.indexOf("For FAIL"));
        expect(failSection).toContain("Review needs attention");
        expect(failSection).toContain(
            "The reviewer found blocking issues. What would you like to do?",
        );
        const reviseIndex = failSection.indexOf("Revise implementation");
        const archiveIndex = failSection.indexOf("Archive despite findings");
        const failLeaveOpenIndex = failSection.indexOf('"label": "Leave open"');
        expect(reviseIndex).toBeLessThan(archiveIndex);
        expect(archiveIndex).toBeLessThan(failLeaveOpenIndex);
        expect(failSection).toContain("Send the review findings back for correction.");
        expect(failSection).toContain(
            "Finish and archive the change without resolving the review findings.",
        );
        expect(failSection).toContain("Keep the change open and take no further action.");

        const actionSection = completionSection.slice(completionSection.indexOf("After the user"));
        expect(actionSection).toContain(
            "For PASS → `Complete and archive`, call `specops_archive`",
        );
        expect(actionSection).toContain("For PASS → `Leave open`");
        expect(actionSection).toContain(
            "For FAIL → `Archive despite findings`, call `specops_archive`",
        );
        expect(actionSection).toContain("For FAIL → `Revise implementation`");
        expect(actionSection).toContain("For FAIL → `Leave open`");
    });

    test("coordinator prompt implements the review remediation loop", () => {
        const prompt = loadPrompt(AGENT_IDS.coordinator);

        expect(prompt).toContain("## Review remediation");
        expect(prompt).toContain("For FAIL → `Revise implementation`, acknowledge");
        expect(prompt).not.toContain("the repair loop is not implemented");
        expect(prompt).not.toContain("Do not dispatch `specops-implementer` yet");
    });

    test("coordinator prompt re-dispatches implementer then reviewer on revise", () => {
        const prompt = loadPrompt(AGENT_IDS.coordinator);

        const remediationSection = prompt.slice(prompt.indexOf("## Review remediation"));

        expect(remediationSection).toContain("Re-dispatch `specops-implementer`");
        expect(remediationSection).toContain("the user's original goal");
        expect(remediationSection).toContain("the current OpenSpec change name");
        expect(remediationSection).toContain("complete `specops-reviewer` FAIL findings verbatim");
        expect(remediationSection).toContain("every `F1..Fn` ID");
        expect(remediationSection).toContain(
            "explicit instruction that this pass is review remediation",
        );
        expect(remediationSection).toContain("Do not summarize, paraphrase, or drop findings");
        expect(remediationSection).toContain("pass them through verbatim");
        expect(remediationSection).toContain("inspect the updated `tasks.md`");
        expect(remediationSection).toContain(
            "all new `## N. Review remediation` items are checked",
        );
        expect(remediationSection).toContain("re-dispatch `specops-reviewer`");
        expect(remediationSection).toContain("**same** review-completion `question` checkpoint");
        expect(remediationSection).toContain("Do not create an automatic retry loop");
        expect(remediationSection).toContain(
            "unless the user explicitly selects `Revise implementation`",
        );
    });

    test("coordinator prompt routes remediation conflicts to planning/design", () => {
        const prompt = loadPrompt(AGENT_IDS.coordinator);

        const remediationSection = prompt.slice(prompt.indexOf("## Review remediation"));

        expect(remediationSection).toContain("requires changing approved requirements or design");
        expect(remediationSection).toContain("route it to `specops-planner` or `specops-designer`");
        expect(remediationSection).toContain("user-decision escalation contract");
        expect(remediationSection).toContain("rather than authorising design changes yourself");
    });

    test("applies configured coordinator model and variant", () => {
        const config: Config = {};
        registerCoordinatorAgent(
            config,
            makeConfig({
                [AGENT_IDS.coordinator]: {
                    model: "opencode-go/deepseek-v4-flash",
                    variant: "high",
                },
            }),
        );

        expect(config.agent?.[SPECOPS_AGENT_ID]).toMatchObject({
            model: "opencode-go/deepseek-v4-flash",
            variant: "high",
        });
    });

    test("applies model without variant when only model is configured", () => {
        const config: Config = {};
        registerCoordinatorAgent(
            config,
            makeConfig({ [AGENT_IDS.coordinator]: { model: "openai/gpt-5" } }),
        );

        expect(config.agent?.[SPECOPS_AGENT_ID]?.model).toBe("openai/gpt-5");
        expect("variant" in (config.agent?.[SPECOPS_AGENT_ID] ?? {})).toBe(false);
    });

    test("omits model and variant for blank model to preserve OpenCode default", () => {
        const config: Config = {};
        registerCoordinatorAgent(
            config,
            makeConfig({ [AGENT_IDS.coordinator]: { model: "   ", variant: "high" } }),
        );

        expect("model" in (config.agent?.[SPECOPS_AGENT_ID] ?? {})).toBe(false);
        expect("variant" in (config.agent?.[SPECOPS_AGENT_ID] ?? {})).toBe(false);
    });

    test("does not modify existing built-in agents", () => {
        const config: Config = {
            agent: {
                build: { description: "Build", mode: "primary", prompt: "Build prompt" },
                plan: { description: "Plan", mode: "primary", prompt: "Plan prompt" },
            },
        };
        registerCoordinatorAgent(config, makeConfig());

        expect(config.agent?.build?.description).toBe("Build");
        expect(config.agent?.plan?.description).toBe("Plan");
    });
});
