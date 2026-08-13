import type { Config } from "@opencode-ai/plugin";
import { describe, expect, test } from "bun:test";
import { AGENT_IDS } from "../../src/agents/ids.js";
import { REVIEWER_AGENT_ID, registerReviewerAgent } from "../../src/agents/reviewer.js";
import { loadPrompt } from "../../src/prompts.js";
import type { SpecOpsConfig } from "../../src/config.js";

/** Build a complete valid role config with optional reviewer overrides. */
function makeConfig(overrides: Partial<SpecOpsConfig["agents"]> = {}): SpecOpsConfig {
    const defaults = Object.fromEntries(
        Object.values(AGENT_IDS).map(id => [id, {}]),
    ) as SpecOpsConfig["agents"];
    return {
        agents: { ...defaults, ...overrides } as SpecOpsConfig["agents"],
        frontierEscalation: false,
    };
}

describe("registerReviewerAgent", () => {
    test("registers the SpecOps reviewer subagent with the reviewer prompt", () => {
        const config: Config = {};
        registerReviewerAgent(config, makeConfig());

        expect(config.agent?.[REVIEWER_AGENT_ID]).toEqual({
            description:
                "Independently verifies implemented OpenSpec changes against requirements, design, tasks, source code, and tests. Use this agent as the final SpecOps quality gate before completion.",
            mode: "subagent",
            prompt: loadPrompt(AGENT_IDS.reviewer),
        });
    });

    test("reviewer prompt independently verifies implementation and OpenSpec artifacts", () => {
        const prompt = loadPrompt(AGENT_IDS.reviewer);

        expect(prompt).toContain("Independently verify");
        expect(prompt).toContain("Inspect the implemented source code and tests directly");
        expect(prompt).toContain("requirements in the proposal and specifications");
        expect(prompt).toContain("approved design");
        expect(prompt).toContain("tasks.md");
        expect(prompt).toContain("openspec validate <change>");
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
        expect(prompt).toContain("Do not rewrite proposal.md");
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
        expect(prompt).toContain("relevant file paths, line references, or verification result");
        expect(prompt).toContain("Non-blocking observations may follow without IDs");
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
        registerReviewerAgent(
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
        registerReviewerAgent(
            config,
            makeConfig({ [AGENT_IDS.reviewer]: { model: "openai/gpt-5" } }),
        );

        expect(config.agent?.[REVIEWER_AGENT_ID]?.model).toBe("openai/gpt-5");
        expect("variant" in (config.agent?.[REVIEWER_AGENT_ID] ?? {})).toBe(false);
    });

    test("omits model and variant for blank model to preserve OpenCode fallback", () => {
        const config: Config = {};
        registerReviewerAgent(
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
                [AGENT_IDS.implementer]: {
                    description: "Implementer",
                    mode: "subagent",
                    prompt: "Implementer prompt",
                },
            },
        };
        registerReviewerAgent(config, makeConfig());

        expect(config.agent?.build?.description).toBe("Build");
        expect(config.agent?.[AGENT_IDS.implementer]?.description).toBe("Implementer");
    });

    test("reviewer prompt does not use the specialist handoff envelope", () => {
        const prompt = loadPrompt(AGENT_IDS.reviewer);

        expect(prompt).not.toContain("STATUS: success | blocked");
        expect(prompt).not.toContain("## Handoff");
        expect(prompt).toContain("PASS");
        expect(prompt).toContain("FAIL");
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
