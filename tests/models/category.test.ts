import { describe, expect, test } from "bun:test";
import { ROLE_WORKFLOW_ORDER } from "../../src/agents/ids.js";
import { agentDisplayName } from "../../src/models.js";

const DISPLAY_NAMES = [
    "Coordinator",
    "Explorer",
    "Planner",
    "Designer",
    "Implementer",
    "Reviewer",
    "Review - Correctness",
    "Review - Risk",
    "Review - Quality",
    "Frontier",
] as const;

describe("agentDisplayName", () => {
    test("returns friendly names in workflow order", () => {
        expect(ROLE_WORKFLOW_ORDER.map(agentDisplayName)).toEqual([...DISPLAY_NAMES]);
    });
});

describe("ROLE_WORKFLOW_ORDER", () => {
    test("matches the SpecOps workflow order", () => {
        expect(ROLE_WORKFLOW_ORDER).toEqual([
            "specops-coordinator",
            "specops-explorer",
            "specops-planner",
            "specops-designer",
            "specops-implementer",
            "specops-reviewer",
            "specops-review-correctness",
            "specops-review-risk",
            "specops-review-quality",
            "specops-frontier",
        ]);
    });
});
