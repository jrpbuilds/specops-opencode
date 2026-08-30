import type { Config } from "@opencode-ai/plugin";
import { describe, expect, test } from "bun:test";
import { AGENT_IDS } from "../../src/agents/ids.js";
import { REVIEWER_AGENT_ID } from "../../src/agents/reviewer.js";
import { registerWorkflowSubagents } from "../../src/host/agents.js";
import { REVIEWER_PERMISSION } from "../../src/agents/permissions.js";
import { loadPrompt } from "../../src/prompts.js";
import {
    DEFAULT_AUTO_REVIEW_ITERATIONS,
    DEFAULT_SUBAGENT_CONCURRENCY,
    type SpecOpsConfig,
} from "../../src/config.js";

/** Build a complete valid role config with optional reviewer overrides. */
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

describe("reviewer agent registration", () => {
    test("registers the SpecOps reviewer subagent with the reviewer prompt", () => {
        const config: Config = {};
        registerWorkflowSubagents(config, makeConfig());

        expect(config.agent?.[REVIEWER_AGENT_ID] as Record<string, unknown>).toEqual({
            description:
                "Independently verifies implemented OpenSpec changes against requirements, design, tasks, source code, and tests. Use this agent as the final SpecOps quality gate before completion.",
            mode: "subagent",
            hidden: true,
            prompt: loadPrompt(AGENT_IDS.reviewer),
            permission: REVIEWER_PERMISSION,
        });
    });

    test("reviewer prompt independently verifies implementation and OpenSpec artifacts", () => {
        const prompt = loadPrompt(AGENT_IDS.reviewer);

        expect(prompt).toContain("Independently verify");
        expect(prompt).toContain("Inspect the implemented source code and tests directly");
        expect(prompt).toContain("Work within the active project/worktree");
        expect(prompt).toContain("requirements in the proposal and specifications");
        expect(prompt).toContain("approved design");
        expect(prompt).toContain("tasks.md");
        expect(prompt).toContain("openspec validate <change>");
    });

    test("reviewer treats specialist reports as non-authoritative evidence", () => {
        const prompt = loadPrompt(AGENT_IDS.reviewer);

        expect(prompt).toContain("## Using specialist evidence");
        expect(prompt).toContain("evidence, not votes or authority");
        expect(prompt).toContain("your direct inspection remains authoritative");
        expect(prompt).toContain("do not see each other's reports");
        expect(prompt).toContain("The compliance matrix, finding contract, PASS/FAIL authority");
    });

    test("reviewer directly disposes specialist blocking candidates instead of counting votes", () => {
        const prompt = loadPrompt(AGENT_IDS.reviewer);

        expect(prompt).toContain("Their `blocking candidate` labels do not determine materiality");
        expect(prompt).toContain("accepted as a canonical `Fk`");
        expect(prompt).toContain("merged into another `Fk`");
        expect(prompt).toContain("downgraded to a sparse non-blocking observation");
        expect(prompt).toContain("Give direct evidence for every downgrade or rejection");
        expect(prompt).toContain("Specialist disposition:");
        expect(prompt).toContain(
            "Do not accept a claim merely because several specialists repeat it",
        );
    });

    test("reviewer treats claims and broad checks as leads, not behavioural proof", () => {
        const prompt = loadPrompt(AGENT_IDS.reviewer);

        expect(prompt).toContain("none is proof by assertion");
        expect(prompt).toContain("actively try to falsify the implementation");
        expect(prompt).toContain("directly exercises or proves that behaviour");
        expect(prompt).toContain("A passing build, typecheck, lint, or unrelated test");
        expect(prompt).toContain("it is not behavioural verification by default");
        expect(prompt).toContain(
            "A PASS must be defensible from direct, behaviour-relevant evidence",
        );
    });

    test("reviewer prompt enforces strict pending-verification failure", () => {
        const prompt = loadPrompt(AGENT_IDS.reviewer);

        expect(prompt).toContain("cannot actually be performed");
        expect(prompt).toContain("do not issue PASS");
        expect(prompt).toContain("do not issue PASS or alter task state");
        expect(prompt).toContain("pending required verification");
        expect(prompt).toContain("Do not fake, infer, or assume completion");
    });

    test("reviewer prompt forbids edits, task completion, fixes, and archive", () => {
        const prompt = loadPrompt(AGENT_IDS.reviewer);

        expect(prompt).toContain("Do not modify source code or tests");
        expect(prompt).toContain("Do not fix findings yourself");
        expect(prompt).toContain(
            "Do not rewrite the planning artifacts reported by the artifact graph",
        );
        expect(prompt).toContain("Do not change `- [ ]` to `- [x]`");
        expect(prompt).toContain("Do not mark tasks complete on behalf of the Implementer");
        expect(prompt).toContain("Do not archive the change");
    });

    test("reviewer prompt requires an unambiguous PASS or FAIL", () => {
        const prompt = loadPrompt(AGENT_IDS.reviewer);

        expect(prompt).toContain("Return exactly one unambiguous outcome");
        expect(prompt).toContain("PASS");
        expect(prompt).toContain("FAIL");
        expect(prompt).toContain("FAIL only for unmet approved requirements");
        expect(prompt).toContain("Do not fail for unrelated style preferences");
    });

    test("reviewer prompt numbers blocking findings for remediation", () => {
        const prompt = loadPrompt(AGENT_IDS.reviewer);

        expect(prompt).toContain("<numbered blocking findings>");
        expect(prompt).toContain("F1");
        expect(prompt).toContain("`Fx`");
        expect(prompt).toContain("mapped directly to remediation");
        expect(prompt).toContain("**Violated:**");
        expect(prompt).toContain("**Problem:**");
        expect(prompt).toContain("**Evidence:**");
        expect(prompt).toContain("**Correction target:**");
        expect(prompt).toContain(
            "Every blocking finding must include exactly one Correction target",
        );
        expect(prompt).toContain("relevant file paths, line references, or verification result");
        expect(prompt).toContain("Non-blocking observations may follow without IDs");
    });

    test("reviewer prompt routes correction targets by schema and earliest layer", () => {
        const prompt = loadPrompt(AGENT_IDS.reviewer);

        expect(prompt).toContain(
            "`implementation` or exactly one existing planning-artifact ID declared by the active OpenSpec schema",
        );
        expect(prompt).toContain("earliest layer in the active artifact graph");
        expect(prompt).toContain("requirements-bearing artifact");
        expect(prompt).toContain("target `design`");
        expect(prompt).toContain("tasks-role artifact");
        expect(prompt).toContain("custom artifact by its declared schema position");
        expect(prompt).toContain("Use `implementation` only when every approved planning artifact");
        expect(prompt).toContain("exactly one literal target per finding");
        expect(prompt).toContain("Do not use free-text diagnoses or multi-target lists");
    });

    test("reviewer prompt recovers malformed correction targets without guessing", () => {
        const prompt = loadPrompt(AGENT_IDS.reviewer);

        expect(prompt).toContain(
            "A missing, empty, or unknown target is a malformed Reviewer handoff",
        );
        expect(prompt).toContain("existing bounded one-resume recovery");
        expect(prompt).toContain("never guess an artifact or silently reinterpret the finding");
    });

    test("reviewer prompt requires a per-behaviour compliance matrix with four evidence states", () => {
        const prompt = loadPrompt(AGENT_IDS.reviewer);

        expect(prompt).toContain("Compliance matrix:");
        expect(prompt).toContain("one matrix row per independently verifiable approved behaviour");
        expect(prompt).toContain("VERIFIED");
        expect(prompt).toContain("COMPLIANT");
        expect(prompt).toContain("UNPROVEN");
        expect(prompt).toContain("FAILING");
    });

    test("reviewer prompt groups only shared-evidence scenarios and never hides distinct or failing ones", () => {
        const prompt = loadPrompt(AGENT_IDS.reviewer);

        expect(prompt).toContain("Group closely related scenarios");
        expect(prompt).toContain("share the same implementation and verification evidence");
        expect(prompt).toContain("Never hide a materially distinct scenario through grouping");
        expect(prompt).toContain("never group a failing or unproven scenario");
    });

    test("reviewer prompt requires PASS to have every matrix row COMPLIANT or VERIFIED", () => {
        const prompt = loadPrompt(AGENT_IDS.reviewer);

        expect(prompt).toContain("A PASS requires every matrix row");
        expect(prompt).toContain("`COMPLIANT` or `VERIFIED`");
    });

    test("reviewer prompt forces FAIL on unresolved UNPROVEN rows", () => {
        const prompt = loadPrompt(AGENT_IDS.reviewer);

        expect(prompt).toContain("An unresolved `UNPROVEN` row must force a FAIL");
        expect(prompt).toContain("it cannot remain in a PASS");
    });

    test("reviewer prompt links FAILING rows to blocking findings for one-to-one remediation", () => {
        const prompt = loadPrompt(AGENT_IDS.reviewer);

        expect(prompt).toContain("FAILING — see F");
        expect(prompt).toContain("Every `FAILING` row must reference its blocking finding");
        expect(prompt).toContain("remediation stays mapped one-to-one");
    });

    test("reviewer prompt does not require an automated test for every behaviour", () => {
        const prompt = loadPrompt(AGENT_IDS.reviewer);

        expect(prompt).toContain("Do not require an automated test for every behaviour");
        expect(prompt).toContain("manual or runtime verification is the appropriate evidence");
    });

    test("applies configured reviewer model and variant", () => {
        const config: Config = {};
        registerWorkflowSubagents(
            config,
            makeConfig({
                [AGENT_IDS.reviewer]: {
                    model: "openai/gpt-5.6-terra",
                    variant: "high",
                },
            }),
        );

        expect(config.agent?.[REVIEWER_AGENT_ID]).toMatchObject({
            model: "openai/gpt-5.6-terra",
            variant: "high",
        });
    });

    test("applies model without variant when only model is configured", () => {
        const config: Config = {};
        registerWorkflowSubagents(
            config,
            makeConfig({ [AGENT_IDS.reviewer]: { model: "openai/gpt-5" } }),
        );

        expect(config.agent?.[REVIEWER_AGENT_ID]?.model).toBe("openai/gpt-5");
        expect("variant" in (config.agent?.[REVIEWER_AGENT_ID] ?? {})).toBe(false);
    });

    test("omits model and variant for blank model to preserve OpenCode fallback", () => {
        const config: Config = {};
        registerWorkflowSubagents(
            config,
            makeConfig({ [AGENT_IDS.reviewer]: { model: "   ", variant: "high" } }),
        );

        expect("model" in (config.agent?.[REVIEWER_AGENT_ID] ?? {})).toBe(false);
        expect("variant" in (config.agent?.[REVIEWER_AGENT_ID] ?? {})).toBe(false);
    });

    test("does not modify existing agents", () => {
        const config: Config = {
            agent: {
                build: { description: "Build", mode: "primary", prompt: "Build prompt" },
                "custom-agent": {
                    description: "Custom",
                    mode: "subagent",
                    prompt: "Custom prompt",
                },
            },
        };
        registerWorkflowSubagents(config, makeConfig());

        expect(config.agent?.build?.description).toBe("Build");
        expect(config.agent?.["custom-agent"]?.description).toBe("Custom");
    });

    test("reviewer prompt does not use the specialist handoff envelope", () => {
        const prompt = loadPrompt(AGENT_IDS.reviewer);

        expect(prompt).not.toContain("STATUS: success | blocked");
        expect(prompt).not.toContain("## Handoff");
        expect(prompt).toContain("PASS");
        expect(prompt).toContain("FAIL");
    });

    test("reviewer prompt treats Project Context as orientation, not a substitute", () => {
        const prompt = loadPrompt(AGENT_IDS.reviewer);

        expect(prompt).toContain("## Project Context");
        expect(prompt).toContain("use it as orientation");
        expect(prompt).toContain("not a substitute for direct inspection");
        expect(prompt).toContain("the repository wins");
        expect(prompt).toContain("Do not treat Project Context as an approved requirement");
    });

    test("reviewer prompt uses the shared optional Engram policy", () => {
        const prompt = loadPrompt(AGENT_IDS.reviewer);

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
        expect(prompt).toContain("A memory may point at a check but never itself ground a `FAIL`");
        expect(prompt).not.toContain("Do not call any Engram");
        expect(prompt).not.toContain("the Explorer owns Engram retrieval");
    });

    test("reviewer memory guidance preserves independent evidence and verdicts", () => {
        const prompt = loadPrompt(AGENT_IDS.reviewer);

        expect(prompt).toContain("prior context, areas to examine, and previous decisions");
        expect(prompt).toContain("never itself ground a `FAIL`");
        expect(prompt).toContain("never satisfies a compliance-matrix evidence row");
        expect(prompt).toContain(
            "`VERIFIED`/`COMPLIANT` require executed or directly inspected evidence",
        );
        expect(prompt).toContain(
            "memory never substitutes for direct inspection of artifacts and repository evidence.",
        );
    });

    test("reviewer prompt defines six proportional review lenses that feed the existing contract", () => {
        const prompt = loadPrompt(AGENT_IDS.reviewer);

        expect(prompt).toContain("## Review lenses");
        expect(prompt).toContain("Correctness / spec compliance");
        expect(prompt).toContain("Reliability");
        expect(prompt).toContain("Resilience / edge cases");
        expect(prompt).toContain("Security / risk");
        expect(prompt).toContain("Maintainability / readability");
        expect(prompt).toContain("Regression risk");
        expect(prompt).toContain("only where the concern is relevant to this change");
        expect(prompt).toContain("Do not manufacture findings");
        expect(prompt).toContain("not a second verdict mechanism");
        expect(prompt).toContain("flow into the compliance matrix");
        expect(prompt).toContain(
            "Do not FAIL merely because you prefer another style or abstraction",
        );
    });

    test("reviewer prompt gates lens findings on material impact and sparse observations", () => {
        const prompt = loadPrompt(AGENT_IDS.reviewer);

        expect(prompt).toContain("A lens observation blocks (becomes an `Fk`) only when");
        expect(prompt).toContain("genuine problem relevant to the approved change");
        expect(prompt).toContain("a non-blocking observation (kept sparse)");
    });

    test("reviewer prompt restricts FAIL to material blockers and excludes non-material nags", () => {
        const prompt = loadPrompt(AGENT_IDS.reviewer);

        expect(prompt).toContain("genuine correctness/reliability/resilience/security problems");
        expect(prompt).toContain("alternative but valid architecture");
        expect(prompt).toContain("speculative future improvements");
        expect(prompt).toContain("unrelated pre-existing problems");
        expect(prompt).toContain("generic best-practice suggestions");
    });

    test("reviewer prompt defines delta-focused remediation re-review mode", () => {
        const prompt = loadPrompt(AGENT_IDS.reviewer);

        expect(prompt).toContain("## Remediation re-review");
        expect(prompt).toContain(
            "active only when the SpecOps coordinator explicitly says this is a remediation re-review",
        );
        expect(prompt).toContain("provides the prior `F1..Fn` blocking findings");
        expect(prompt).toContain("perform the normal full review above");
        expect(prompt).toContain("planning artifacts revised during remediation");
        expect(prompt).toContain("RESOLVED");
        expect(prompt).toContain("UNRESOLVED");
        expect(prompt).toContain("REGRESSED");
        expect(prompt).toContain("REMEDIATION REVIEW");
    });

    test("reviewer prompt keeps prior finding IDs stable and continues numbering for new findings", () => {
        const prompt = loadPrompt(AGENT_IDS.reviewer);

        expect(prompt).toContain("Keep the same `F` ID");
        expect(prompt).toContain(
            "Do not use `REGRESSED` when the original issue simply remains unfixed",
        );
        expect(prompt).toContain("new `F` ID continuing the existing numbering");
        expect(prompt).toContain("do not renumber existing findings");
        expect(prompt).toContain("scoped to this review/remediation loop only");
    });

    test("reviewer prompt restricts re-review scope and preserves the single verdict", () => {
        const prompt = loadPrompt(AGENT_IDS.reviewer);

        expect(prompt).toContain("Perform a fresh full review of the current approved change");
        expect(prompt).toContain("independently verify each prior finding");
        expect(prompt).toContain("material approved-scope defects that earlier review missed");
        expect(prompt).toContain("Do not report unrelated cleanup, subjective relitigation");
        expect(prompt).toContain("Do not relitigate a finding marked `RESOLVED`");
        expect(prompt).toContain("including one missed during initial review");
        expect(prompt).toContain("continuing the existing numbering");
        expect(prompt).toContain("Revalidate the complete compliance matrix");
        expect(prompt).toContain("The `REMEDIATION REVIEW` block is informational");
        expect(prompt).toContain("`PASS`/`FAIL` remains the only verdict");
    });

    test("reviewer prompt defines Frontier-eligible blocker request and preserves verdict ownership", () => {
        const prompt = loadPrompt(AGENT_IDS.reviewer);

        const section = prompt.slice(prompt.indexOf("## Frontier escalation"));

        expect(prompt).toContain("## Frontier escalation");
        expect(section).toContain("FRONTIER ELIGIBLE BLOCKER");
        expect(section).toContain("genuinely difficult unresolved technical ambiguity");
        expect(section).toContain("blocks a PASS/FAIL determination");
        expect(section).toContain("Frontier advice cannot override your verdict");
        expect(section).toContain("you still issue the final PASS or FAIL yourself");
        expect(section).toContain("Frontier advice is advisory only");
        expect(section).toContain("You remain the sole owner of the final verdict");
    });
});
