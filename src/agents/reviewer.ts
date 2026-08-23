import { loadPrompt } from "../prompts.js";
import { AGENT_IDS } from "./ids.js";
import { REVIEWER_PERMISSION } from "./permissions.js";
import type { SpecOpsConfig } from "../config.js";
import type { SpecOpsAgentDefinition } from "./definition.js";

/**
 * Subagent ID used by the Coordinator to delegate independent final review.
 */
export const REVIEWER_AGENT_ID = AGENT_IDS.reviewer;

/**
 * Build the SpecOps reviewer subagent definition using the persisted reviewer
 * role config.
 *
 * A blank reviewer model is preserved as the semantic "use the invoking primary
 * agent's model": the `model` and `variant` fields are omitted from the
 * definition. The reviewer is intended to remain verification-only through its
 * prompt and native edit denial. Its unrestricted bash permission can still
 * perform shell mutations, so this is not a hard shell-level immutability
 * guarantee. Lifecycle actions such as archiving stay with the Coordinator and
 * deterministic tools.
 *
 * @param specOpsConfig Validated persisted role-to-model configuration.
 */
export function reviewerAgentDefinition(specOpsConfig: SpecOpsConfig): SpecOpsAgentDefinition {
    const reviewer = specOpsConfig.agents[AGENT_IDS.reviewer];
    const model = reviewer.model?.trim();

    return {
        id: REVIEWER_AGENT_ID,
        description:
            "Independently verifies implemented OpenSpec changes against requirements, design, " +
            "tasks, source code, and tests. Use this agent as the final SpecOps quality gate " +
            "before completion.",
        mode: "subagent",
        hidden: true,
        prompt: loadPrompt(AGENT_IDS.reviewer),
        permission: REVIEWER_PERMISSION,
        ...(model ? { model, ...(reviewer.variant ? { variant: reviewer.variant } : {}) } : {}),
    };
}
