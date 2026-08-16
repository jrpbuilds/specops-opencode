import type { Config } from "@opencode-ai/plugin";
import { describe, expect, test } from "bun:test";
import { AGENT_IDS } from "../../src/agents/ids.js";
import {
    applyFrontierState,
    registerAutoCoordinatorAgent,
    registerCoordinatorAgent,
    SPECOPS_AGENT_ID,
    SPECOPS_AUTO_AGENT_ID,
} from "../../src/agents/coordinator.js";
import {
    COORDINATOR_PERMISSION,
    SPECOPS_LIFECYCLE_PERMISSION,
    SPECOPS_TASK_ALLOW,
} from "../../src/agents/permissions.js";
import { loadPrompt, loadPromptFile } from "../../src/prompts.js";
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

function evaluateTask(task: Record<string, "allow" | "deny">, name: string): "allow" | "deny" {
    let action: "allow" | "deny" | undefined;
    for (const [pattern, effect] of Object.entries(task)) {
        const matches =
            pattern === "*" ||
            (pattern.endsWith("*") && name.startsWith(pattern.slice(0, -1))) ||
            pattern === name;
        if (matches) action = effect;
    }
    return action ?? "deny";
}

describe("registerCoordinatorAgent", () => {
    test("registers the SpecOps primary agent with the coordinator prompt", () => {
        const config: Config = {};
        registerCoordinatorAgent(config, makeConfig());

        expect(config.agent?.[SPECOPS_AGENT_ID]).toMatchObject({
            description: "SpecOps coordinator for spec-driven development",
            mode: "primary",
            prompt: applyFrontierState(loadPrompt(AGENT_IDS.coordinator), false),
            permission: {
                ...COORDINATOR_PERMISSION,
                question: "allow",
                task: SPECOPS_TASK_ALLOW,
            },
        });
        expect(
            (
                config.agent?.[SPECOPS_AGENT_ID]?.permission as
                    { question?: "allow" | "deny" } | undefined
            )?.question,
        ).toBe("allow");
        const interactivePermission = config.agent?.[SPECOPS_AGENT_ID]?.permission as
            Record<string, unknown> | undefined;
        expect(interactivePermission?.external_directory).toBe("deny");
        expect(interactivePermission?.doom_loop).toBe("deny");
        expect(interactivePermission?.bash).toEqual({
            "*": "deny",
            "openspec --help": "allow",
            "openspec * --help": "allow",
        });
        expect(interactivePermission?.[SPECOPS_LIFECYCLE_PERMISSION]).toBe("allow");
        expect(interactivePermission?.task).toEqual(SPECOPS_TASK_ALLOW);
        expect(interactivePermission?.task).toEqual({ "*": "deny", "specops-*": "allow" });
    });

    test("registers the SpecOps Auto agent with the autonomous appendix and denied question", () => {
        const config: Config = {};
        registerAutoCoordinatorAgent(config, makeConfig());

        expect(config.agent?.[SPECOPS_AUTO_AGENT_ID]).toMatchObject({
            mode: "primary",
            prompt: applyFrontierState(
                loadPrompt(AGENT_IDS.coordinator) + "\n\n" + loadPromptFile("coordinator-auto.md"),
                false,
            ),
        });
        expect(
            (
                config.agent?.[SPECOPS_AUTO_AGENT_ID]?.permission as
                    { question?: "allow" | "deny" } | undefined
            )?.question,
        ).toBe("deny");
        expect(config.agent?.[SPECOPS_AUTO_AGENT_ID]).toMatchObject({
            permission: COORDINATOR_PERMISSION,
        });
        const autoPermission = config.agent?.[SPECOPS_AUTO_AGENT_ID]?.permission as
            Record<string, unknown> | undefined;
        expect(autoPermission?.task).toEqual(SPECOPS_TASK_ALLOW);
        expect(autoPermission?.external_directory).toBe("deny");
        expect(autoPermission?.doom_loop).toBe("deny");
        expect(autoPermission?.bash).toEqual({
            "*": "deny",
            "openspec --help": "allow",
            "openspec * --help": "allow",
        });
        expect(autoPermission?.[SPECOPS_LIFECYCLE_PERMISSION]).toBe("allow");
        expect(autoPermission?.task).toEqual({ "*": "deny", "specops-*": "allow" });
        const prompt = config.agent?.[SPECOPS_AUTO_AGENT_ID]?.prompt as string;
        expect(prompt).toContain("## Autonomous operation (SpecOps Auto)");
        expect(prompt).not.toContain("{{AUTO_MODE_STATE}}");
    });

    test("restricts both coordinators to the private SpecOps subagent namespace", () => {
        const configs = [
            (() => {
                const config: Config = {};
                registerCoordinatorAgent(config, makeConfig());
                return config;
            })(),
            (() => {
                const config: Config = {};
                registerAutoCoordinatorAgent(config, makeConfig());
                return config;
            })(),
        ];
        const names = [
            "general",
            "explore",
            "scout",
            "custom-non-specops",
            "specops-explorer",
            "specops-planner",
            "specops-designer",
            "specops-implementer",
            "specops-reviewer",
            "specops-frontier",
        ];

        for (const config of configs) {
            const permission = (config.agent?.[SPECOPS_AGENT_ID]?.permission ??
                config.agent?.[SPECOPS_AUTO_AGENT_ID]?.permission) as {
                task: Record<string, "allow" | "deny">;
            };
            expect(permission.task).toEqual({ "*": "deny", "specops-*": "allow" });
            expect(Object.keys(permission.task)).toEqual(["*", "specops-*"]);

            for (const name of names) {
                expect(evaluateTask(permission.task, name)).toBe(
                    name.startsWith("specops-") ? "allow" : "deny",
                );
            }
        }
    });

    test("auto coordinator prompt overrides checkpoints with the autonomous policy", () => {
        const autoPrompt =
            loadPrompt(AGENT_IDS.coordinator) + "\n\n" + loadPromptFile("coordinator-auto.md");

        expect(autoPrompt).toContain("overrides the human-checkpoint clauses above");
        expect(autoPrompt).toContain("Never invoke OpenCode's native `question` tool");
        expect(autoPrompt).toContain("Prefer an explicit specialist recommendation");
        expect(autoPrompt).toContain("at most 2 remediation rounds total");
        expect(autoPrompt).toContain("call `specops_archive`");
        expect(autoPrompt).toContain("`COMPLETED`");
        expect(autoPrompt).toContain("`BLOCKED`");
    });

    test("interactive coordinator prompt has no autonomous appendix", () => {
        const prompt = loadPrompt(AGENT_IDS.coordinator);

        expect(prompt).not.toContain("## Autonomous operation (SpecOps Auto)");
        expect(prompt).not.toContain("{{AUTO_MODE_STATE}}");
    });

    test("coordinator prompt mandates the workflow for every goal including greenfield", () => {
        const prompt = loadPrompt(AGENT_IDS.coordinator);

        expect(prompt).toContain("## Workflow");
        expect(prompt).toContain("The goal is the WHAT; the workflow is the HOW");
        expect(prompt).toContain("regardless of how self-contained, greenfield, small");
        expect(prompt).toContain("Greenfield projects run every phase");
        expect(prompt).toContain(
            "A self-contained or single-file deliverable is never a reason to skip",
        );
        expect(prompt).toContain("run the workflow, do not build the goal directly");
        expect(prompt).toContain(
            "`specops-explorer` investigates the repository's tooling, conventions, and constraints",
        );
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

    test("coordinator prompt defines the specialist handoff envelope and its limits", () => {
        const prompt = loadPrompt(AGENT_IDS.coordinator);

        expect(prompt).toContain("## Specialist handoffs");
        const section = prompt.slice(prompt.indexOf("## Specialist handoffs"));

        expect(section).toContain("STATUS: success | blocked");
        expect(section).toContain("completed its owned pass even if non-blocking risks remain");
        expect(section).toContain("could not complete and requires follow-up");
        expect(section).toContain("`SUMMARY`");
        expect(section).toContain("`ARTIFACTS`");
        expect(section).toContain("`VERIFICATION`");
        expect(section).toContain("`RISKS`");
        expect(section).toContain("`NEXT`");
        expect(section).toContain("Never ordinary changed source or test files");
        expect(section).toContain("advisory only and never overrides your own workflow");
        expect(section).toContain("continue to inspect the change's OpenSpec artifacts");
        expect(section).toContain("returned alone and take precedence over the envelope");
        expect(section).toContain("do not use the handoff envelope");
        expect(section).toContain("routing signal");
        expect(section).toContain("without taking over specialist work");
    });

    test("coordinator prompt retains, updates, and passes scoped Project Context", () => {
        const prompt = loadPrompt(AGENT_IDS.coordinator);

        expect(prompt).toContain("## Project Context");
        const section = prompt.slice(
            prompt.indexOf("## Project Context"),
            prompt.indexOf("## Frontier escalation"),
        );

        expect(section).toContain("PROJECT CONTEXT capsule");
        expect(section).toContain("for this `/specops` run only");
        expect(section).toContain("Do not persist it anywhere");
        expect(section).toContain("OpenSpec remains the durable source of truth");
        expect(section).toContain("update only the affected fields");
        expect(section).toContain("Do not keep merge history or multiple versions");
        expect(section).toContain("Trim it to what that specialist needs");
        expect(section).toContain("orientation, not authority");
        expect(section).toContain("the repository wins");

        const delegationBullet =
            "the relevant Project Context from `specops-explorer` (scoped to this delegation)";
        expect(
            (
                prompt.match(
                    /the relevant Project Context from `specops-explorer` \(scoped to this delegation\)/g,
                ) ?? []
            ).length,
        ).toBeGreaterThanOrEqual(5);
        expect(prompt).toContain(delegationBullet);
    });

    test("coordinator prompt uses the shared optional Engram policy", () => {
        const prompt = loadPrompt(AGENT_IDS.coordinator);

        const section = prompt.slice(
            prompt.indexOf("## Project Context"),
            prompt.indexOf("## Frontier escalation"),
        );

        expect(section).toContain("## Engram");
        expect(section).toContain("If Engram memory tools are available, you may use them");
        expect(section).toContain("Use Engram as contextual memory, not authority.");
        expect(section).toContain(
            "Current explicit user instructions and the current approved OpenSpec artifacts govern the change;",
        );
        expect(section).toContain(
            "current repository and executed evidence govern what exists today.",
        );
        expect(section).toContain(
            "Engram memory must yield whenever it conflicts with any of them.",
        );
        expect(section).toContain(
            "Do not use Engram as an alternative store for SpecOps change artifacts or workflow state.",
        );
        expect(section).toContain(
            "Engram is optional. Its absence or failure must not block your pass.",
        );
        expect(section).not.toContain("retrieved and reconciled exclusively by `specops-explorer`");
        expect(section).not.toContain("Do not call Engram tools yourself");
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

    test("coordinator prompt self-onboards first and blocks on onboarding failure", () => {
        const prompt = loadPrompt(AGENT_IDS.coordinator);

        expect(prompt).toContain("call `specops_onboard` first");
        expect(prompt).toContain("do not invoke the `/specops-onboard` slash command");
        expect(prompt).toContain("before `specops_context` and before any specialist delegation");
        expect(prompt).toContain("never requires a human checkpoint");
        expect(prompt).toContain("already initialised");
        expect(prompt).toContain("initialised successfully");
        expect(prompt).toContain("preserving the user's original goal exactly");
        expect(prompt).toContain("never consumes or replaces the requested SpecOps task");
        expect(prompt).toContain("terminate immediately as BLOCKED");
        expect(prompt).toContain("OpenSpec is not installed");
        expect(prompt).toContain("Failed to initialise OpenSpec");
        expect(prompt).toContain(
            "Do not call `specops_context` and do not delegate to any specialist",
        );
        expect(prompt).not.toContain("direct the user to `/specops-onboard`");
        expect(prompt).not.toContain("Do not run onboarding yourself");
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

    test("coordinator prompt re-dispatches reviewer with prior findings for remediation re-review", () => {
        const prompt = loadPrompt(AGENT_IDS.coordinator);

        const remediationSection = prompt.slice(prompt.indexOf("## Review remediation"));

        expect(remediationSection).toContain(
            "the prior `specops-reviewer` FAIL findings (`F1..Fn`) verbatim",
        );
        expect(remediationSection).toContain(
            "an explicit instruction that this is a remediation re-review",
        );
        expect(remediationSection).toContain("the Implementer's remediation summary");
        expect(remediationSection).toContain("Pass the prior findings verbatim");
        expect(remediationSection).toContain("without relitigating unrelated issues");
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

    describe("plan checkpoint", () => {
        function getPlanCheckpointSection(prompt: string): string {
            return prompt.slice(
                prompt.indexOf("## Plan checkpoint"),
                prompt.indexOf("## Implementation", prompt.indexOf("## Plan checkpoint") + 1),
            );
        }

        test("completed planning triggers checkpoint before Implementer", () => {
            const prompt = loadPrompt(AGENT_IDS.coordinator);

            expect(prompt).toContain("## Plan checkpoint");
            expect(prompt).toContain("completedTasks");
            expect(prompt).toContain("totalTasks");
            expect(prompt).toContain("no implementation tasks have started");
            expect(prompt.indexOf("## Plan checkpoint")).toBeLessThan(
                prompt.indexOf("## Implementation", prompt.indexOf("## Plan checkpoint") + 1),
            );
            const implementationSection = prompt.slice(
                prompt.indexOf("## Implementation", prompt.indexOf("## Plan checkpoint") + 1),
            );
            expect(implementationSection).toContain("plan checkpoint has been cleared");
            expect(implementationSection).toContain(
                "delegate implementation to `specops-implementer`",
            );
        });

        test("Start implementation option is the single explicit option", () => {
            const prompt = loadPrompt(AGENT_IDS.coordinator);
            const planCheckpointSection = getPlanCheckpointSection(prompt);

            expect(planCheckpointSection).toContain('"label": "Start implementation"');
            expect(planCheckpointSection).toContain("Proceed with the approved OpenSpec plan.");
            expect(planCheckpointSection).toContain(
                "Start implementation, or type your feedback if you'd like anything changed.",
            );
            expect(planCheckpointSection).toContain('"header": "Plan ready"');
        });

        test("custom type-your-own answer is explicitly enabled", () => {
            const prompt = loadPrompt(AGENT_IDS.coordinator);
            const planCheckpointSection = getPlanCheckpointSection(prompt);

            expect(planCheckpointSection).toContain('"custom": true');
            expect(planCheckpointSection).toContain(
                "custom/type-your-own-answer explicitly enabled",
            );
        });

        test("checkpoint has no Leave open option", () => {
            const prompt = loadPrompt(AGENT_IDS.coordinator);
            const planCheckpointSection = getPlanCheckpointSection(prompt);

            expect(planCheckpointSection).not.toContain('"label": "Leave open"');
            expect(planCheckpointSection).toContain(
                "approval-or-feedback only, not a lifecycle choice",
            );
        });

        test("custom answers are the only revision path", () => {
            const prompt = loadPrompt(AGENT_IDS.coordinator);
            const planCheckpointSection = getPlanCheckpointSection(prompt);

            expect(planCheckpointSection).not.toContain('"label": "Revise');
            expect(planCheckpointSection).toContain("treat the response verbatim as plan feedback");
            expect(planCheckpointSection).toContain("Route the feedback to the owning specialist");
        });

        test("feedback never implicitly approves implementation", () => {
            const prompt = loadPrompt(AGENT_IDS.coordinator);
            const planCheckpointSection = getPlanCheckpointSection(prompt);

            expect(planCheckpointSection).toContain("Do not implement.");
            expect(planCheckpointSection).toContain(
                "Never silently start implementation after a revision",
            );
            expect(planCheckpointSection).toContain(
                "the user must explicitly select `Start implementation` on the updated checkpoint",
            );
        });

        test("custom revision routes to the correct specialist", () => {
            const prompt = loadPrompt(AGENT_IDS.coordinator);
            const planCheckpointSection = getPlanCheckpointSection(prompt);

            expect(planCheckpointSection).toContain(
                "Requirements, externally observable behaviour",
            );
            expect(planCheckpointSection).toContain("`specops-planner` (requirements pass)");
            expect(planCheckpointSection).toContain("Technical design, architecture");
            expect(planCheckpointSection).toContain("`specops-designer`");
            expect(planCheckpointSection).toContain("Task breakdown only");
            expect(planCheckpointSection).toContain("`specops-planner` (tasks pass)");
        });

        test("revised artifacts return to the checkpoint before implementation", () => {
            const prompt = loadPrompt(AGENT_IDS.coordinator);
            const planCheckpointSection = getPlanCheckpointSection(prompt);

            expect(planCheckpointSection).toContain(
                "present the plan checkpoint again with the updated summary",
            );
            expect(planCheckpointSection).toContain(
                "Any user-requested revision invalidates the previous approval",
            );
        });

        test("upstream revision causes only necessary downstream reconciliation", () => {
            const prompt = loadPrompt(AGENT_IDS.coordinator);
            const planCheckpointSection = getPlanCheckpointSection(prompt);

            expect(planCheckpointSection).toContain("Preserve unaffected content");
            expect(planCheckpointSection).toContain("chain only as far as the change propagates");
            expect(planCheckpointSection).toContain(
                "requirements change → designer if affected → planner (tasks pass)",
            );
            expect(planCheckpointSection).toContain("design change → planner (tasks pass)");
            expect(planCheckpointSection).toContain("tasks change → no downstream");
        });

        test("resumed fully planned change with zero completed tasks shows checkpoint", () => {
            const prompt = loadPrompt(AGENT_IDS.coordinator);
            const planCheckpointSection = getPlanCheckpointSection(prompt);

            expect(planCheckpointSection).toContain("`completedTasks` is 0");
            expect(planCheckpointSection).toContain("`totalTasks` is greater than 0");
            expect(planCheckpointSection).toContain("naturally present the checkpoint again");
        });

        test("resumed change where implementation has started skips checkpoint", () => {
            const prompt = loadPrompt(AGENT_IDS.coordinator);
            const planCheckpointSection = getPlanCheckpointSection(prompt);

            expect(planCheckpointSection).toContain("`completedTasks` is greater than 0");
            expect(planCheckpointSection).toContain("implementation has already begun");
            expect(planCheckpointSection).toContain("skip the checkpoint");
        });

        test("checkpoint uses no persisted approval state", () => {
            const prompt = loadPrompt(AGENT_IDS.coordinator);
            const planCheckpointSection = getPlanCheckpointSection(prompt);

            expect(planCheckpointSection).toContain("Do not introduce a persisted `");
            expect(planCheckpointSection).toContain("approved");
            expect(planCheckpointSection).toContain("flag");
            expect(planCheckpointSection).toContain("OpenSpec remains the durable source of truth");
        });

        test("checkpoint does not call specops_context again", () => {
            const prompt = loadPrompt(AGENT_IDS.coordinator);
            const planCheckpointSection = getPlanCheckpointSection(prompt);

            expect(planCheckpointSection).toContain("Do not call `specops_context` again");
            expect(planCheckpointSection).toContain(
                "inspect the `tasks.md` checkbox state directly",
            );
        });

        test("existing review remediation and lifecycle behaviour remains unchanged", () => {
            const prompt = loadPrompt(AGENT_IDS.coordinator);

            expect(prompt).toContain("## Review completion");
            expect(prompt).toContain("## Review remediation");
            expect(prompt).toContain('"label": "Leave open"');
            expect(prompt).toContain("Complete and archive");
            expect(prompt).toContain("Revise implementation");
        });

        test("Implementation section is gated on the checkpoint", () => {
            const prompt = loadPrompt(AGENT_IDS.coordinator);
            const implementationSection = prompt.slice(prompt.indexOf("## Implementation"));

            expect(implementationSection).toContain(
                "plan checkpoint has been cleared with `Start implementation`",
            );
            expect(implementationSection).toContain(
                "delegate implementation to `specops-implementer`",
            );
        });
    });

    describe("frontier escalation", () => {
        test("raw coordinator prompt contains the frontier state placeholder", () => {
            const prompt = loadPrompt(AGENT_IDS.coordinator);

            expect(prompt).toContain("{{FRONTIER_ESCALATION_STATE}}");
        });

        test("applyFrontierState substitutes enabled and disabled", () => {
            const raw = loadPrompt(AGENT_IDS.coordinator);

            expect(applyFrontierState(raw, true)).not.toContain("{{FRONTIER_ESCALATION_STATE}}");
            expect(applyFrontierState(raw, true)).toMatch(
                /Frontier escalation is currently enabled\b/,
            );

            expect(applyFrontierState(raw, false)).not.toContain("{{FRONTIER_ESCALATION_STATE}}");
            expect(applyFrontierState(raw, false)).toMatch(
                /Frontier escalation is currently disabled\b/,
            );
        });

        test("registered coordinator prompt reflects disabled escalation", () => {
            const config: Config = {};
            registerCoordinatorAgent(config, makeConfig());

            const prompt = config.agent?.[SPECOPS_AGENT_ID]?.prompt as string;
            expect(prompt).toContain("Frontier escalation is currently disabled");
            expect(prompt).not.toContain("Frontier escalation is currently enabled");
            expect(prompt).not.toContain("{{FRONTIER_ESCALATION_STATE}}");
        });

        test("registered coordinator prompt reflects enabled escalation", () => {
            const config: Config = {};
            registerCoordinatorAgent(config, { ...makeConfig(), frontierEscalation: true });

            const prompt = config.agent?.[SPECOPS_AGENT_ID]?.prompt as string;
            expect(prompt).toContain("Frontier escalation is currently enabled");
            expect(prompt).not.toContain("Frontier escalation is currently disabled");
            expect(prompt).not.toContain("{{FRONTIER_ESCALATION_STATE}}");
        });

        test("coordinator prompt defines the frontier escalation contract", () => {
            const prompt = loadPrompt(AGENT_IDS.coordinator);
            const section = prompt.slice(prompt.indexOf("## Frontier escalation"));

            expect(prompt).toContain("## Frontier escalation");
            expect(section).toContain("adaptive consultation path");
            expect(section).toContain("**not** a normal workflow phase");
            expect(section).toContain("Missing repository evidence");
            expect(section).toContain("`specops-explorer`");
            expect(section).toContain("USER DECISION REQUIRED");
            expect(section).toContain("Routine implementation errors");
            expect(section).toContain("genuinely difficult unresolved technical reasoning");
            expect(section).toContain("`specops-frontier`");
        });

        test("coordinator prompt requires one frontier consultation per blocker", () => {
            const prompt = loadPrompt(AGENT_IDS.coordinator);
            const section = prompt.slice(prompt.indexOf("## Frontier escalation"));

            expect(section).toContain("at most one Frontier consultation");
            expect(section).toContain("during this `/specops` run");
            expect(section).toContain("Track which blockers you have already escalated");
            expect(section).toContain("do not call `specops-frontier` again");
            expect(section).toContain("Fall back to the existing blocker path");
        });

        test("coordinator prompt states frontier is advice-only and preserves reviewer sovereignty", () => {
            const prompt = loadPrompt(AGENT_IDS.coordinator);
            const section = prompt.slice(prompt.indexOf("## Frontier escalation"));

            expect(section).toContain("advice only");
            expect(section).toContain("must not modify source code");
            expect(section).toContain("OpenSpec artifacts");
            expect(section).toContain("review verdicts");
            expect(section).toContain(
                "The Reviewer remains the sole owner of the final PASS/FAIL verdict",
            );
            expect(section).toContain("Frontier may advise on an ambiguous potential blocker");
            expect(section).toContain("must never override the Reviewer");
        });

        test("coordinator prompt forbids persisted frontier state", () => {
            const prompt = loadPrompt(AGENT_IDS.coordinator);
            const section = prompt.slice(prompt.indexOf("## Frontier escalation"));

            expect(section).toContain("Do not persist escalation records");
            expect(section).toContain("counters");
            expect(section).toContain("episode histories");
            expect(section).toContain("OpenSpec remains the durable source of truth");
        });

        test("coordinator prompt defines disabled fallback paths", () => {
            const prompt = applyFrontierState(loadPrompt(AGENT_IDS.coordinator), false);
            const section = prompt.slice(prompt.indexOf("## Frontier escalation"));

            expect(section).toContain("`specops-frontier` is not available in this session");
            expect(section).toContain("must not be invoked");
            expect(section).toContain(
                "Route every `FRONTIER ELIGIBLE BLOCKER` request through the existing paths",
            );
            expect(section).not.toContain("Do not attempt to invoke a Frontier subagent");
        });
    });
});
