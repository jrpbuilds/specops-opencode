import { describe, expect, test } from "bun:test";
import { ALL_AGENT_IDS, ROLE_WORKFLOW_ORDER } from "../../src/agents/ids.js";
import { agentDisplayName, agentSettingsCategory } from "../../src/models.js";

const DISPLAY_NAMES = [
    "Coordinator",
    "Explorer",
    "Planner",
    "Designer",
    "Implementer",
    "Reviewer",
    "Frontier",
] as const;

describe("agentDisplayName", () => {
    test("returns friendly names in workflow order", () => {
        expect(ROLE_WORKFLOW_ORDER.map(agentDisplayName)).toEqual([...DISPLAY_NAMES]);
    });
});

describe("agentSettingsCategory", () => {
    test("coordinator maps to Coordination", () => {
        expect(agentSettingsCategory("specops-coordinator")).toBe("Coordination");
    });

    test("explorer, planner, and designer map to Planning", () => {
        expect(agentSettingsCategory("specops-explorer")).toBe("Planning");
        expect(agentSettingsCategory("specops-planner")).toBe("Planning");
        expect(agentSettingsCategory("specops-designer")).toBe("Planning");
    });

    test("implementer maps to Implementation", () => {
        expect(agentSettingsCategory("specops-implementer")).toBe("Implementation");
    });

    test("reviewer maps to Review", () => {
        expect(agentSettingsCategory("specops-reviewer")).toBe("Review");
    });

    test("frontier maps to Frontier", () => {
        expect(agentSettingsCategory("specops-frontier")).toBe("Frontier");
    });

    test("every role is covered by exactly one category", () => {
        const categories = new Set(ALL_AGENT_IDS.map(id => agentSettingsCategory(id)));
        expect(categories).toEqual(
            new Set(["Coordination", "Planning", "Implementation", "Review", "Frontier"]),
        );
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
            "specops-frontier",
        ]);
    });
});
