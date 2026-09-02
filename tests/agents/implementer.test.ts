import type { Config } from "@opencode-ai/plugin";
import { describe, expect, test } from "bun:test";
import { AGENT_IDS } from "../../src/agents/ids.js";
import { IMPLEMENTER_AGENT_ID } from "../../src/agents/implementer.js";
import { registerWorkflowSubagents } from "../../src/host/agents.js";
import { IMPLEMENTER_PERMISSION } from "../../src/agents/permissions.js";
import { loadPrompt } from "../../src/prompts.js";
import {
    DEFAULT_AUTO_REVIEW_ITERATIONS,
    DEFAULT_IMPLEMENTER_FANOUT,
    DEFAULT_REVIEW_FANOUT,
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
        implementerFanout: DEFAULT_IMPLEMENTER_FANOUT,
        reviewFanout: DEFAULT_REVIEW_FANOUT,
    };
}

describe("implementer agent registration", () => {
    test("registers the SpecOps implementer subagent with the implementer prompt", () => {
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
    });

    test("implementer registration keeps native access within the active worktree", () => {
        const config: Config = {};
        registerWorkflowSubagents(config, makeConfig());

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
        registerWorkflowSubagents(
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
        registerWorkflowSubagents(
            config,
            makeConfig({ [AGENT_IDS.implementer]: { model: "openai/gpt-5" } }),
        );

        expect(config.agent?.[IMPLEMENTER_AGENT_ID]?.model).toBe("openai/gpt-5");
        expect("variant" in (config.agent?.[IMPLEMENTER_AGENT_ID] ?? {})).toBe(false);
    });

    test("omits model and variant for blank model to preserve OpenCode fallback", () => {
        const config: Config = {};
        registerWorkflowSubagents(
            config,
            makeConfig({ [AGENT_IDS.implementer]: { model: "   ", variant: "high" } }),
        );

        expect("model" in (config.agent?.[IMPLEMENTER_AGENT_ID] ?? {})).toBe(false);
        expect("variant" in (config.agent?.[IMPLEMENTER_AGENT_ID] ?? {})).toBe(false);
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
                "custom-tooling": {
                    description: "Tooling",
                    mode: "subagent",
                    prompt: "Tooling prompt",
                },
            },
        };
        registerWorkflowSubagents(config, makeConfig());

        expect(config.agent?.build?.description).toBe("Build");
        expect(config.agent?.[AGENT_IDS.coordinator]?.description).toBe("Coordinator");
        expect(config.agent?.["custom-research"]?.description).toBe("Research");
        expect(config.agent?.["custom-planning"]?.description).toBe("Planning");
        expect(config.agent?.["custom-tooling"]?.description).toBe("Tooling");
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

    test("implementer prompt uses change breadcrumbs for orientation without ownership state", () => {
        const prompt = loadPrompt(AGENT_IDS.implementer);

        expect(prompt).toContain("## Change breadcrumbs");
        expect(prompt).toContain("starting or resuming the same active change");
        expect(prompt).toContain("focused lookup keyed by the change name");
        expect(prompt).toContain(
            "orientation to verify against the current repository and canonical task state",
        );
        expect(prompt).toContain("never as current state");
        expect(prompt).toContain("files changed");
        expect(prompt).toContain("types/interfaces/APIs/abstractions touched");
        expect(prompt).toContain("integration points");
        expect(prompt).toContain("design-constrained decisions");
        expect(prompt).toContain("verification performed");
        expect(prompt).toContain("caveats or risks");
        expect(prompt).toContain("Never record task-completion, checkbox, or assignment state.");
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

describe("scoped task assignment contract", () => {
    function scopedAssignmentSection(): string {
        const prompt = loadPrompt(AGENT_IDS.implementer);
        const start = prompt.indexOf("## Scoped task assignment");
        const end = prompt.indexOf("## Review remediation", start);
        return prompt.slice(start, end);
    }

    test("requires verify-first ownership of the entire assigned task list", () => {
        const section = scopedAssignmentSection();

        expect(section).toContain("that list is your entire assignment");
        expect(section).toContain(
            "verify every assigned ID exists in the supplied canonical task list and is unchecked",
        );
        expect(section).toContain(
            "stop and report the stale assignment in your handoff instead of implementing",
        );
    });

    test.each([
        "Work only the assigned task IDs",
        "Every other unchecked task is out of scope: do not implement it, verify it, or check it off",
        "never opportunistically consume extra tasks because they look trivial or adjacent",
    ])("keeps scoped work bounded: %s", clause => {
        expect(scopedAssignmentSection()).toContain(clause);
    });

    test("limits supporting changes and stops rather than expanding scope", () => {
        const section = scopedAssignmentSection();

        expect(section).toContain("changes only where directly required by the assigned tasks");
        expect(section).toContain("unexpected dependency on an unassigned task");
        expect(section).toContain("shared integration point another dispatch may touch");
        expect(section).toContain("evidence your assignment is stale");
        expect(section).toContain("stop expanding scope and report the condition");
        expect(section).toContain("Leave the affected task unchecked");
    });

    test.each([
        "Mark only your assigned tasks complete",
        "smallest possible targeted edit flipping `- [ ]` to `- [x]` on your own task lines",
        "Never rewrite, reorder, or reformat the tasks artifact, and never alter another task's checkbox",
    ])("keeps completion edits limited to assigned task lines: %s", clause => {
        expect(scopedAssignmentSection()).toContain(clause);
    });

    test("requires the scoped handoff to report completed task IDs and blockers", () => {
        expect(scopedAssignmentSection()).toContain(
            "reporting which assigned task IDs you completed and any blocker",
        );
    });

    test.each([
        "When the dispatch carries no `assignedTaskIds`, execute all unchecked tasks under the whole-list rules below",
        "this remains the serial path and is unchanged",
    ])("preserves the serial whole-list path: %s", clause => {
        expect(scopedAssignmentSection()).toContain(clause);
    });

    test("prefers focused lane verification while siblings are active", () => {
        const section = scopedAssignmentSection();

        expect(section).toContain(
            "verify your assigned work with focused checks: run the tests and repository checks that directly exercise your assigned tasks",
        );
        expect(section).toContain(
            "prefer lane-local or targeted verification where the repository supports it",
        );
        expect(section).toContain(
            "Do not run expensive whole-repository checks as ceremony while siblings are still editing unrelated parts",
        );
    });

    test("keeps broad checks available when the assignment genuinely requires them", () => {
        expect(scopedAssignmentSection()).toContain(
            "broad checks remain available when the assignment genuinely requires them or the repository offers no meaningful focused alternative",
        );
    });

    test("routes unrelated moving-worktree failures to the coordinator without touching sibling work", () => {
        const section = scopedAssignmentSection();

        expect(section).toContain(
            "do not modify sibling-owned work and do not report the unrelated failure as an assigned-task defect without evidence",
        );
        expect(section).toContain("potentially affected by concurrent work");
        expect(section).toContain(
            "The existing overlap, dependency, and suspension rules still apply when a failure reveals a genuine shared integration point",
        );
    });

    test("keeps task-level verification intact and defers broad checks to the settled pass", () => {
        const section = scopedAssignmentSection();

        expect(section).toContain(
            "Focused verification never waives verifying the work you mark complete",
        );
        expect(section).toContain(
            "whole-repository checks and the full suite belong to the coordinator's settled integrated verification pass after all lanes settle",
        );
    });
});

describe("settled integrated verification contract", () => {
    function settledVerificationSection(): string {
        const prompt = loadPrompt(AGENT_IDS.implementer);
        const start = prompt.indexOf("## Settled integrated verification");
        const end = prompt.indexOf("## Review remediation", start);
        return prompt.slice(start, end);
    }

    test("activates only on explicit coordinator instruction and verifies the settled state", () => {
        const section = settledVerificationSection();

        expect(section).toContain(
            "When the coordinator explicitly instructs you to perform the settled integrated verification pass",
        );
        expect(section).toContain("verification is your entire assignment");
        expect(section).toContain(
            "verify the settled state as it exists now, from the current repository and the coordinator-supplied canonical apply-instruction context — never from prior implementer summaries",
        );
    });

    test("runs repository-appropriate broad checks and change validation", () => {
        const section = settledVerificationSection();

        expect(section).toContain(
            "the full relevant test suite where appropriate, plus the typecheck, build, lint, and format checks the repository requires",
        );
        expect(section).toContain("Run `openspec validate <change>`");
    });

    test("reports checks that could not be performed", () => {
        expect(settledVerificationSection()).toContain(
            "including any check you could not perform and why",
        );
    });

    test("is report-only: failures route back and nothing is edited", () => {
        const section = settledVerificationSection();

        expect(section).toContain(
            "report the failures as findings in your handoff for the coordinator to route back through normal implementation handling",
        );
        expect(section).toContain(
            "Do not fix them, do not edit source or tests, and do not modify any task checkbox — reporting is your whole job in this pass",
        );
    });

    test("returns the outcome in the standard handoff envelope", () => {
        expect(settledVerificationSection()).toContain(
            "which checks ran, which passed, which failed, and which could not be performed",
        );
    });
});
