import type { Config } from "@opencode-ai/plugin";
import { loadPrompt } from "../prompts.js";
import { AGENT_IDS } from "./ids.js";
import { PLANNER_PERMISSION, type RolePermission } from "./permissions.js";
import type { SpecOpsConfig } from "../config.js";

/**
 * OpenCode subagent ID used by the Coordinator to delegate planning-artifact
 * authorship.
 */
export const PLANNER_AGENT_ID = AGENT_IDS.planner;

/**
 * Register the SpecOps planner subagent using the persisted planner role config.
 *
 * A blank planner model is preserved as the semantic "use the invoking primary
 * agent's model": the `model` and `variant` fields are omitted from the agent config.
 * The planner owns proposal, capability-specification, and task-plan authoring
 * according to its packaged prompt.
 *
 * @param config OpenCode configuration object mutated with the subagent.
 * @param specOpsConfig Validated persisted role-to-model configuration.
 */
export function registerPlannerAgent(config: Config, specOpsConfig: SpecOpsConfig): void {
    config.agent ??= {};
    const planner = specOpsConfig.agents[AGENT_IDS.planner];
    const model = planner.model?.trim();

    config.agent[PLANNER_AGENT_ID] = {
        description:
            "Authors OpenSpec planning artifacts — proposals, capability " +
            "specifications, and implementation tasks — from the user's goal and " +
            "repository evidence. Use this agent for SpecOps planning artifacts.",
        mode: "subagent",
        hidden: true,
        permission: PLANNER_PERMISSION as unknown as RolePermission,
        prompt: loadPrompt(AGENT_IDS.planner),
        ...(model ? { model, ...(planner.variant ? { variant: planner.variant } : {}) } : {}),
    };
}
