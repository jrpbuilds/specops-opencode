import { loadPrompt } from "../prompts.js";
import { AGENT_IDS } from "./ids.js";
import { DESIGNER_PERMISSION } from "./permissions.js";
import type { SpecOpsConfig } from "../config.js";
import type { SpecOpsAgentDefinition } from "./definition.js";

/**
 * Subagent ID used by the Coordinator to delegate technical design artifact
 * authorship.
 */
export const DESIGNER_AGENT_ID = AGENT_IDS.designer;

/**
 * Build the SpecOps designer subagent definition using the persisted designer
 * role config.
 *
 * A blank designer model is preserved as the semantic "use the invoking primary
 * agent's model": the `model` and `variant` fields are omitted from the
 * definition. The designer is registered separately so design ownership remains
 * distinct from planning and implementation ownership.
 *
 * @param specOpsConfig Validated persisted role-to-model configuration.
 */
export function designerAgentDefinition(specOpsConfig: SpecOpsConfig): SpecOpsAgentDefinition {
    const designer = specOpsConfig.agents[AGENT_IDS.designer];
    const model = designer.model?.trim();

    return {
        id: DESIGNER_AGENT_ID,
        description:
            "Authors the technical OpenSpec design from approved requirements and repository " +
            "evidence. Use this agent to create design.md for SpecOps changes.",
        mode: "subagent",
        hidden: true,
        permission: DESIGNER_PERMISSION,
        prompt: loadPrompt(AGENT_IDS.designer),
        ...(model ? { model, ...(designer.variant ? { variant: designer.variant } : {}) } : {}),
    };
}
