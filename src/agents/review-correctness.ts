import { loadPrompt } from "../prompts.js";
import type { SpecOpsConfig } from "../config.js";
import { resolveAgentMapping } from "../models.js";
import { AGENT_IDS } from "./ids.js";
import { REVIEWER_PERMISSION } from "./permissions.js";
import type { SpecOpsAgentDefinition } from "./definition.js";

/** Hidden review specialist that reports focused functional-correctness critique. */
export const REVIEW_CORRECTNESS_AGENT_ID = AGENT_IDS.reviewCorrectness;

/**
 * Build the correctness specialist definition with Reviewer-inheriting mapping.
 *
 * The shared reviewer permission keeps the specialist read-only for edits while
 * preserving the existing shell evidence boundary used by review.
 */
export function reviewCorrectnessAgentDefinition(
    specOpsConfig: SpecOpsConfig,
): SpecOpsAgentDefinition {
    const mapping = resolveAgentMapping(specOpsConfig, REVIEW_CORRECTNESS_AGENT_ID);
    const model = mapping.model?.trim();

    return {
        id: REVIEW_CORRECTNESS_AGENT_ID,
        description:
            "Focused critique of functional correctness against the approved requirements and " +
            "design. Produces no final review verdict; specops-reviewer owns that decision.",
        mode: "subagent",
        hidden: true,
        prompt: loadPrompt(REVIEW_CORRECTNESS_AGENT_ID),
        permission: REVIEWER_PERMISSION,
        ...(model ? { model, ...(mapping.variant ? { variant: mapping.variant } : {}) } : {}),
    };
}
