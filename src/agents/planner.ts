import { loadPrompt } from "../prompts.js";
import { AGENT_IDS } from "./ids.js";
import { PLANNER_PERMISSION } from "./permissions.js";
import type { SpecOpsConfig } from "../config.js";
import type { SpecOpsAgentDefinition } from "./definition.js";

/**
 * Subagent ID used by the Coordinator to delegate planning-artifact authorship.
 */
export const PLANNER_AGENT_ID = AGENT_IDS.planner;

/**
 * Build the SpecOps planner subagent definition using the persisted planner
 * role config.
 *
 * A blank planner model is preserved as the semantic "use the invoking primary
 * agent's model": the `model` and `variant` fields are omitted from the
 * definition. The planner owns proposal, capability-specification, and
 * task-plan authoring according to its packaged prompt.
 *
 * @param specOpsConfig Validated persisted role-to-model configuration.
 */
export function plannerAgentDefinition(specOpsConfig: SpecOpsConfig): SpecOpsAgentDefinition {
    const planner = specOpsConfig.agents[AGENT_IDS.planner];
    const model = planner.model?.trim();

    return {
        id: PLANNER_AGENT_ID,
        description:
            "Authors OpenSpec planning artifacts — proposals, capability " +
            "specifications, and implementation tasks — from the user's goal and " +
            "repository evidence. Use this agent for SpecOps planning artifacts.",
        mode: "subagent",
        hidden: true,
        permission: PLANNER_PERMISSION,
        prompt: loadPrompt(AGENT_IDS.planner),
        ...(model ? { model, ...(planner.variant ? { variant: planner.variant } : {}) } : {}),
    };
}
