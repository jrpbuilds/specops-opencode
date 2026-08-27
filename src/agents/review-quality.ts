import { loadPrompt } from "../prompts.js";
import type { SpecOpsConfig } from "../config.js";
import { resolveAgentMapping } from "../models.js";
import { AGENT_IDS } from "./ids.js";
import { REVIEWER_PERMISSION } from "./permissions.js";
import type { SpecOpsAgentDefinition } from "./definition.js";

/** Hidden review specialist that reports focused maintainability critique. */
export const REVIEW_QUALITY_AGENT_ID = AGENT_IDS.reviewQuality;

/** Build the quality specialist definition with Reviewer-inheriting mapping. */
export function reviewQualityAgentDefinition(specOpsConfig: SpecOpsConfig): SpecOpsAgentDefinition {
    const mapping = resolveAgentMapping(specOpsConfig, REVIEW_QUALITY_AGENT_ID);
    const model = mapping.model?.trim();

    return {
        id: REVIEW_QUALITY_AGENT_ID,
        description:
            "Focused critique of maintainability, readability, repository consistency, and " +
            "testability. Produces no final review verdict; specops-reviewer owns that decision.",
        mode: "subagent",
        hidden: true,
        prompt: loadPrompt(REVIEW_QUALITY_AGENT_ID),
        permission: REVIEWER_PERMISSION,
        ...(model ? { model, ...(mapping.variant ? { variant: mapping.variant } : {}) } : {}),
    };
}
