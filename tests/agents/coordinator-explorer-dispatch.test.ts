import { describe, expect, test } from "bun:test";
import { buildCoordinatorPrompt } from "../../src/agents/coordinator.js";
import { AGENT_IDS } from "../../src/agents/ids.js";
import { loadPrompt } from "../../src/prompts.js";

describe("coordinator-explorer-dispatch contract", () => {
    const interactive = buildCoordinatorPrompt("interactive", false);
    const auto = buildCoordinatorPrompt("auto", false);

    test("both modes use the shared conditional evidence rule", () => {
        expect(interactive).toContain("## Conditional Explorer on resume");
        expect(auto).toContain("## Autonomous conditional Explorer");
        for (const prompt of [interactive, auto]) {
            expect(prompt).toContain("full scan if no Project Context capsule exists");
            expect(prompt).toContain("focused follow-ups");
            expect(prompt).toContain("continuing unchecked implementation tasks");
            expect(prompt).toContain("review remediation/re-review");
            expect(prompt).toContain("lifecycle handling after a completed review");
            expect(prompt).toContain("skip Explorer");
        }
    });

    test("planning evidence is requested only for planning work", () => {
        expect(interactive).toContain("when the next planning action needs repository evidence");
        expect(auto).toContain("plan checkpoint");
        expect(interactive).toContain("If the next action is this checkpoint");
        expect(auto).toContain("If planning is complete and implementation has not started");
    });

    test("specialists preserve the repository-evidence ownership boundary", () => {
        const planner = loadPrompt(AGENT_IDS.planner);
        expect(planner).toMatch(/Do not\s+inspect repository source yourself/);
        expect(planner).toContain("tell the Coordinator exactly what Explorer must investigate");

        const designer = loadPrompt(AGENT_IDS.designer);
        expect(designer).toMatch(/do not\s+inspect repository source yourself/i);
        expect(designer).toContain("focused Explorer follow-up");
        expect(loadPrompt(AGENT_IDS.implementer)).toMatch(
            /Inspect\s+the repository source and tests directly/,
        );
        expect(loadPrompt(AGENT_IDS.reviewer)).toContain(
            "Inspect the implemented source code and tests directly",
        );
    });
});
