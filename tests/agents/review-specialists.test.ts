import { describe, expect, test } from "bun:test";
import { AGENT_IDS } from "../../src/agents/ids.js";
import { loadPrompt } from "../../src/prompts.js";

const SPECIALISTS = [
    ["correctness", AGENT_IDS.reviewCorrectness, "C1..Cn"],
    ["risk", AGENT_IDS.reviewRisk, "R1..Rn"],
    ["quality", AGENT_IDS.reviewQuality, "Q1..Qn"],
] as const;

describe("review specialist prompt contracts", () => {
    test.each(SPECIALISTS)(
        "%s critic is advisory and uses the shared evidence contract once",
        (_name, id, localIds) => {
            const prompt = loadPrompt(id);

            expect(prompt.split("## Specialist evidence contract")).toHaveLength(2);
            expect(prompt).toContain("Never issue, imply, or recommend an overall PASS or FAIL");
            expect(prompt).toContain("A `blocking candidate` is evidence");
            expect(prompt).toContain(localIds);
            expect(prompt).toContain("### REVIEW COVERAGE");
            expect(prompt).toContain("### FINDINGS");
            expect(prompt).toContain("NO MATERIAL FINDINGS");
            expect(prompt).toContain("Residual uncertainty");
            expect(prompt).toContain("Do not manufacture a finding");
        },
    );

    test.each(SPECIALISTS)("%s critic carries no memory guidance", (_name, id) => {
        const prompt = loadPrompt(id);

        expect(prompt).not.toContain("## Engram");
        expect(prompt).not.toContain("memory");
        expect(prompt).not.toContain("topic_key");
        expect(prompt).not.toContain("change/<change-name>");
    });

    test("correctness critic uses a falsification and behaviour-tracing method", () => {
        const prompt = loadPrompt(AGENT_IDS.reviewCorrectness);

        expect(prompt).toContain("try to disprove");
        expect(prompt).toContain("approved behaviours, invariants");
        expect(prompt).toContain("inputs, branches, state transitions, side effects, outputs");
        expect(prompt).toContain("callers, and lifecycle boundaries");
        expect(prompt).toContain("misleading mocks");
        expect(prompt).toContain("what assertions actually establish");
    });

    test("risk critic scopes realistic applicable risk surfaces before analysis", () => {
        const prompt = loadPrompt(AGENT_IDS.reviewRisk);

        expect(prompt).toContain("First identify which risk surfaces actually apply");
        expect(prompt).toContain("trust and privilege boundaries");
        expect(prompt).toContain("shared state, concurrency, races, retries, and idempotency");
        expect(prompt).toContain("partial failure, cleanup, recovery");
        expect(prompt).toContain("fictional enterprise threat model");
    });

    test("quality critic blocks material engineering defects, not personal taste", () => {
        const prompt = loadPrompt(AGENT_IDS.reviewQuality);

        expect(prompt).toContain("accidental complexity");
        expect(prompt).toContain("duplicated policy, protocol, validation");
        expect(prompt).toContain("brittle, tautological, under-asserted");
        expect(prompt).toContain("credible correctness or regression risk");
        expect(prompt).toContain("Equivalent valid abstractions");
        expect(prompt).toContain("naming bikeshedding");
        expect(prompt).toContain("speculative extensibility");
    });
});
