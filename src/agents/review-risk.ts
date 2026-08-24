import { loadPrompt } from "../prompts.js";
import { resolveAgentMapping, type SpecOpsConfig } from "../config.js";
import { AGENT_IDS } from "./ids.js";
import { REVIEWER_PERMISSION } from "./permissions.js";
import type { SpecOpsAgentDefinition } from "./definition.js";

/** Hidden review specialist that reports focused material-risk critique. */
export const REVIEW_RISK_AGENT_ID = AGENT_IDS.reviewRisk;

/** Build the risk specialist definition with Reviewer-inheriting mapping. */
export function reviewRiskAgentDefinition(specOpsConfig: SpecOpsConfig): SpecOpsAgentDefinition {
    const mapping = resolveAgentMapping(specOpsConfig, REVIEW_RISK_AGENT_ID);
    const model = mapping.model?.trim();

    return {
        id: REVIEW_RISK_AGENT_ID,
        description:
            "Focused critique of material failure modes, regression exposure, security hazards, " +
            "and operational risks. Produces no final review verdict; specops-reviewer owns " +
            "that decision.",
        mode: "subagent",
        hidden: true,
        prompt: loadPrompt(REVIEW_RISK_AGENT_ID),
        permission: REVIEWER_PERMISSION,
        ...(model ? { model, ...(mapping.variant ? { variant: mapping.variant } : {}) } : {}),
    };
}
