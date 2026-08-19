import { describe, expect, test } from "bun:test";
import { AGENT_IDS } from "../../src/agents/ids.js";
import { buildCoordinatorPrompt } from "../../src/agents/coordinator.js";
import { loadPrompt } from "../../src/prompts.js";

describe("coordinator-explorer-dispatch contract", () => {
    const interactive = buildCoordinatorPrompt("interactive", false);
    const auto = buildCoordinatorPrompt("auto", false);

    describe("fresh-change dispatch matrix", () => {
        test("interactive dispatches Explorer on a fresh change", () => {
            expect(interactive).toContain("run `specops-explorer` only when");
            expect(interactive).toContain("fresh changes");
            expect(interactive).toContain("full scan if no Project Context capsule exists");
        });

        test("auto dispatches Explorer on a fresh change", () => {
            expect(auto).toContain("run `specops-explorer` only when");
            expect(auto).toContain("fresh changes");
        });

        test("partially planned resumes with a feasible artifact dispatch Explorer", () => {
            expect(interactive).toContain(
                "If a planning artifact is feasible for authoring or revision",
            );
            expect(auto).toContain("If a planning artifact is feasible for authoring or revision");
        });
    });

    describe("resume skip matrix", () => {
        test("interactive skips Explorer at the plan-approval checkpoint", () => {
            expect(interactive).toContain("plan-approval checkpoint");
            expect(interactive).toContain("skip Explorer and present the plan checkpoint");
        });

        test("auto skips Explorer when the plan is ready", () => {
            expect(auto).toContain("planning is complete and implementation has not started");
            expect(auto).toContain("skip Explorer and auto-approve the Implementer");
        });

        test("both modes skip Explorer while implementation is in progress", () => {
            expect(interactive).toContain("continuing unchecked implementation tasks");
            expect(auto).toContain("continuing unchecked implementation tasks");
            expect(interactive).toContain("skip the Explorer pass");
            expect(auto).toContain("skip the Explorer pass");
        });

        test("both modes skip Explorer for review, remediation, and lifecycle resumes", () => {
            for (const prompt of [interactive, auto]) {
                expect(prompt).toContain("all-tasks-complete review");
                expect(prompt).toContain("review remediation/re-review");
                expect(prompt).toContain("lifecycle handling after a completed review");
                expect(prompt).toContain("skip Explorer and route directly");
            }
        });
    });

    describe("specialist-requested follow-up contract", () => {
        test("Planner and Designer missing-evidence handoffs trigger focused follow-up", () => {
            expect(interactive).toContain("Re-run Explorer on Planner/Designer handoffs");
            expect(interactive).toContain("focused follow-up, not a full startup scan");
            expect(auto).toContain("Re-run Explorer on Planner/Designer handoffs");
            expect(auto).toContain("focused follow-up, not a full startup scan");
        });

        test("an implementation conflict gets focused evidence before upstream routing", () => {
            expect(interactive).toContain(
                "missing repository evidence → focused `specops-explorer` follow-up",
            );
            expect(interactive).toContain(
                "planner/designer/implementer material inconsistency handoff",
            );
            expect(interactive).toContain("relevant scoped Project Context");
        });
    });

    describe("revision-invalidated Project Context contract", () => {
        test("material planning revision re-dispatches Explorer", () => {
            expect(interactive).toContain("materially invalidated the scoped Project Context");
            expect(interactive).toContain("drop the stale capsule");
            expect(interactive).toContain("focused Explorer follow-up");
        });

        test("trivial planning revision does not re-dispatch Explorer", () => {
            expect(interactive).toContain("content change OR new evidence");
            expect(interactive).toContain("materially invalidated");
        });
    });

    describe("role-boundary preservation", () => {
        test("Planner and Designer do not bypass Explorer", () => {
            for (const id of [AGENT_IDS.planner, AGENT_IDS.designer]) {
                const prompt = loadPrompt(id);
                expect(prompt).toContain("Do not inspect repository source code yourself");
                expect(prompt).toContain("do not bypass the explorer");
            }
        });

        test("Implementer and Reviewer retain direct source inspection", () => {
            expect(loadPrompt(AGENT_IDS.implementer)).toContain(
                "Inspect and modify repository source code and tests directly",
            );
            expect(loadPrompt(AGENT_IDS.reviewer)).toContain(
                "Inspect the implemented source code and tests directly",
            );
        });
    });
});
