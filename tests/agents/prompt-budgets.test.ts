import { describe, expect, test } from "bun:test";
import { AGENT_IDS } from "../../src/agents/ids.js";
import { loadPrompt } from "../../src/prompts.js";

const SPECIALIST_PROMPT_BUDGETS = [
    ["explorer", AGENT_IDS.explorer, 5_000],
    ["planner", AGENT_IDS.planner, 14_000],
    ["designer", AGENT_IDS.designer, 12_000],
    ["implementer", AGENT_IDS.implementer, 12_000],
    ["reviewer", AGENT_IDS.reviewer, 20_000],
    ["review-correctness", AGENT_IDS.reviewCorrectness, 6_000],
    ["review-risk", AGENT_IDS.reviewRisk, 6_000],
    ["review-quality", AGENT_IDS.reviewQuality, 6_000],
    ["frontier", AGENT_IDS.frontier, 5_000],
] as const;

describe("specialist prompt budgets", () => {
    for (const [name, id, budget] of SPECIALIST_PROMPT_BUDGETS) {
        test(`${name} prompt stays within its regression budget`, () => {
            expect(loadPrompt(id).length).toBeLessThan(budget);
        });
    }
});
