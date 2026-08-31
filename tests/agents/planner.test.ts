import type { Config } from "@opencode-ai/plugin";
import { describe, expect, test } from "bun:test";
import { AGENT_IDS } from "../../src/agents/ids.js";
import { PLANNER_AGENT_ID } from "../../src/agents/planner.js";
import { registerWorkflowSubagents } from "../../src/host/agents.js";
import { PLANNER_PERMISSION } from "../../src/agents/permissions.js";
import { loadPrompt } from "../../src/prompts.js";
import {
    DEFAULT_AUTO_REVIEW_ITERATIONS,
    DEFAULT_SUBAGENT_CONCURRENCY,
    type SpecOpsConfig,
} from "../../src/config.js";

/** Build a complete valid role config with optional planner overrides. */
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

describe("planner agent registration", () => {
    test("registers the SpecOps planner subagent with the planner prompt", () => {
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

    test("planner prompt owns schema-declared requirements and task artifacts across two passes", () => {
        const prompt = loadPrompt(AGENT_IDS.planner);

        expect(prompt).toContain("## Requirements planning");
        expect(prompt).toContain("## Task planning");
        expect(prompt).toContain(
            "Each dispatch assigns exactly one artifact; author only that artifact in that pass",
        );
        expect(prompt).toContain(
            "Author exactly the dispatched artifact using `openspec instructions <id> --change <change>`, at its reported `outputPath`.",
        );
        expect(prompt).toContain("Preserve completed artifacts");
        expect(prompt).toContain("Treat every reported skipped artifact as satisfied");
    });

    test("planner prompt defines material-decision escalation and resume behavior", () => {
        const prompt = loadPrompt(AGENT_IDS.planner);

        expect(prompt).toContain("## Escalating material unresolved decisions");
        expect(prompt).toContain("materially affects requirements");
        expect(prompt).toContain("Do not ask the coordinator about choices you can safely make");
        expect(prompt).toContain("USER DECISION REQUIRED");
        expect(prompt).toContain("exactly one decision request");
        expect(prompt).toContain("2–4 materially distinct options");
        expect(prompt).toContain("put the recommended option first in `Options`");
        expect(prompt).toContain(
            "Do not ask the coordinator to generate, merge, remove, or rank options",
        );
        expect(prompt).toContain("resume the **same pass**");
        expect(prompt).toContain("new USER DECISION REQUIRED request");
        expect(prompt).toContain("Do not persist the question or answer");
    });

    test("planner produces observable, independently verifiable requirements without designing", () => {
        const prompt = loadPrompt(AGENT_IDS.planner);

        expect(prompt).toContain("Extract the user's goal, explicit constraints");
        expect(prompt).toContain("affected capabilities and observable actors or consumers");
        expect(prompt).toContain("externally observable behaviour and the invariants");
        expect(prompt).toContain("each normative requirement independently verifiable");
        expect(prompt).toContain("without guessing any consequential behaviour");
        expect(prompt).toContain("what must be true, not an unnecessary implementation choice");
    });

    test("planner tasks state outcomes and verification without unnecessary mechanics", () => {
        const prompt = loadPrompt(AGENT_IDS.planner);

        expect(prompt).toContain(
            "concrete implementation outcome and how completion can be verified",
        );
        expect(prompt).toContain("Order them by dependency");
        expect(prompt).toContain("directly necessary supporting work without expanding scope");
        expect(prompt).toContain("Do not prescribe internal mechanics");
    });

    test("planner task planning prefers coherent implementation lanes over parallel splitting", () => {
        const prompt = loadPrompt(AGENT_IDS.planner);

        // Tightly related work stays in one lane: producer→consumer chains,
        // neighbouring-layer builds, and shared types or test setup.
        expect(prompt).toContain("Prefer coherent implementation lanes");
        expect(prompt).toContain(
            "keep producer→consumer chains, neighbouring-layer builds within one subsystem",
        );
        expect(prompt).toContain(
            "work sharing types, abstractions, registrations, contract tests, or test setup together in one lane",
        );
        expect(prompt).toContain("one task or adjacent ordered tasks");

        // Lanes split only on genuine implementation segregation, with the
        // full per-lane size and verification criteria.
        expect(prompt).toContain(
            "Split into separate lanes only on genuine implementation segregation",
        );
        expect(prompt).toContain("a meaningfully separate subsystem or write surface");
        expect(prompt).toContain(
            "low overlap in source files, shared types, integration points, and test setup",
        );
        expect(prompt).toContain("little need to understand partially completed sibling work");
        expect(prompt).toContain("independent implementation and verification");
        expect(prompt).toContain(
            "enough substantive work per lane to justify another implementer's context and bootstrap cost",
        );

        // Dependency-permitted splits and too-small lanes never justify a split.
        expect(prompt).toContain(
            "Never split merely because the dependency graph permits parallel execution",
        );
        expect(prompt).toContain(
            "work too small to repay another implementer's context and bootstrap cost stays in the lane it relates to",
        );

        // Downstream-gating lanes stay legible for the coordinator's
        // critical-path dispatch judgement (issue #45); without numeric
        // duration estimates or scheduling metadata.
        expect(prompt).toContain(
            "Where one lane naturally gates substantial downstream work, keep that gating legible in the dependency ordering and task descriptions",
        );
        expect(prompt).toContain(
            "do not add numeric duration estimates or new scheduling metadata",
        );

        // The old parallelism preference is removed.
        expect(prompt).not.toContain(
            "when work can safely proceed in parallel, keep it as separate, clearly ordered tasks",
        );
    });

    test("planner prompt distinguishes resolvable conflicts from user-scope conflicts", () => {
        const prompt = loadPrompt(AGENT_IDS.planner);

        expect(prompt).toContain("internal or artifact conflict can be resolved");
        expect(prompt).toContain("report it to the coordinator as a conflict");
        expect(prompt).toContain("materially conflicting user requirements or constraints");
        expect(prompt).toContain("escalate that conflict as a USER DECISION REQUIRED request");
    });

    test("planner prompt gates tasks on graph readiness and forbids implementation and checkboxes", () => {
        const prompt = loadPrompt(AGENT_IDS.planner);

        expect(prompt).toContain("Graph readiness is the coordinator's responsibility");
        expect(prompt).toContain(
            "If the design-role artifact(s), when the schema declares any, record Open Questions",
        );
        expect(prompt).toContain(
            "check the design-role artifact(s), when the schema declares any, for unresolved conflicts",
        );
        expect(prompt).not.toContain("If `design.md` records Open Questions");
        expect(prompt).not.toContain("check `design.md` for unresolved conflicts");
        expect(prompt).toContain("Do not inspect repository source code yourself");
        expect(prompt).toContain("Do not author artifacts outside the dispatched set");
        expect(prompt).toContain("Do not implement source changes yourself");
        expect(prompt).toContain("Do not mark tasks complete");
        expect(prompt).toContain("- [ ]");
        expect(prompt).toContain("return a concise summary");
        expect(prompt).toContain("openspec instructions <id> --change <change>");
        expect(prompt).toContain("artifact scope and detail proportional to the change");
        expect(prompt).toContain("right-sized for coherent implementation");
        expect(prompt).not.toContain("no implementation specialist is available");
    });

    test("planner prompt allows tasks.md revision and preserves unaffected tasks", () => {
        const prompt = loadPrompt(AGENT_IDS.planner);

        expect(prompt).toContain("When the coordinator returns the tasks artifact for revision");
        expect(prompt).toContain("revise only the affected tasks");
        expect(prompt).toContain("preserve everything else");
        expect(prompt).toContain("including any existing `- [x]` completion state");
        expect(prompt).toContain("Do not regenerate unaffected tasks");
    });

    test("planner honors revision dispatch metadata without resetting valid tasks", () => {
        const prompt = loadPrompt(AGENT_IDS.planner);
        const section = prompt.slice(
            prompt.indexOf("A revision dispatch"),
            prompt.indexOf(
                "After authoring, run `openspec validate",
                prompt.indexOf("A revision dispatch"),
            ),
        );
        expect(section).toContain("`revisionTarget`");
        expect(section).toContain("`upstreamFeedback`");
        expect(section).toContain(
            "Preserve completed artifacts unless the coordinator explicitly returns them for revision",
        );
        expect(section).toContain("revise only the affected tasks");
        expect(section).toContain("including any existing `- [x]` completion state");
        expect(section).toContain("Do not regenerate unaffected tasks");
    });

    test("applies configured planner model and variant", () => {
        const config: Config = {};
        registerWorkflowSubagents(
            config,
            makeConfig({
                [AGENT_IDS.planner]: {
                    model: "openai/gpt-5.6-terra",
                    variant: "high",
                },
            }),
        );

        expect(config.agent?.[PLANNER_AGENT_ID]).toMatchObject({
            model: "openai/gpt-5.6-terra",
            variant: "high",
        });
    });

    test("applies model without variant when only model is configured", () => {
        const config: Config = {};
        registerWorkflowSubagents(
            config,
            makeConfig({ [AGENT_IDS.planner]: { model: "openai/gpt-5" } }),
        );

        expect(config.agent?.[PLANNER_AGENT_ID]?.model).toBe("openai/gpt-5");
        expect("variant" in (config.agent?.[PLANNER_AGENT_ID] ?? {})).toBe(false);
    });

    test("omits model and variant for blank model to preserve OpenCode fallback", () => {
        const config: Config = {};
        registerWorkflowSubagents(
            config,
            makeConfig({ [AGENT_IDS.planner]: { model: "   ", variant: "high" } }),
        );

        expect("model" in (config.agent?.[PLANNER_AGENT_ID] ?? {})).toBe(false);
        expect("variant" in (config.agent?.[PLANNER_AGENT_ID] ?? {})).toBe(false);
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
                "custom-agent": {
                    description: "Custom",
                    mode: "subagent",
                    prompt: "Custom prompt",
                },
            },
        };
        registerWorkflowSubagents(config, makeConfig());

        expect(config.agent?.build?.description).toBe("Build");
        expect(config.agent?.[AGENT_IDS.coordinator]?.description).toBe("Coordinator");
        expect(config.agent?.["custom-agent"]?.description).toBe("Custom");
    });

    test("planner prompt returns the standard handoff envelope and keeps special modes standalone", () => {
        const prompt = loadPrompt(AGENT_IDS.planner);

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

    test("planner prompt consumes Project Context as non-authoritative orientation", () => {
        const prompt = loadPrompt(AGENT_IDS.planner);

        expect(prompt).toContain("## Project Context");
        expect(prompt).toContain("use it as orientation");
        expect(prompt).toContain("not authoritative");
        expect(prompt).toContain("win if they conflict");
        expect(prompt).toContain("Do not copy Project Context into");
        expect(prompt).toContain("report the missing evidence to the coordinator");
    });

    test("planner prompt uses the shared optional Engram policy", () => {
        const prompt = loadPrompt(AGENT_IDS.planner);

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

    test("planner memory guidance is historical background, not artifact authority", () => {
        const prompt = loadPrompt(AGENT_IDS.planner);

        expect(prompt).toContain("## Memory orientation");
        expect(prompt).toContain("may read prior decision/constraint breadcrumbs as background");
        expect(prompt).toContain("(terminology, prior architecture, conventions)");
        expect(prompt).toContain(
            "never substitute for the user's goal, approved artifacts, or explorer evidence",
        );
        expect(prompt).toContain("never recover lifecycle state");
        expect(prompt).toContain("write a concise breadcrumb for a material decision's rationale");
        expect(prompt).toContain("never copy artifact content into memory");
    });

    test("planner prompt defines Frontier-eligible blocker request and resume behaviour", () => {
        const prompt = loadPrompt(AGENT_IDS.planner);

        expect(prompt).toContain("## Frontier escalation");
        expect(prompt).toContain("FRONTIER ELIGIBLE BLOCKER");
        expect(prompt).toContain("Blocker:");
        expect(prompt).toContain("What I tried:");
        expect(prompt).toContain("Why this is genuinely difficult:");
        expect(prompt).toContain("Question for Frontier:");
        expect(prompt).toContain(
            "Do not report a Frontier-eligible blocker for missing repository evidence",
        );
        expect(prompt).toContain("resume the same pass");
        expect(prompt).toContain("Frontier advice is advisory only");
    });
});
