import type { Config } from "@opencode-ai/plugin";
import { loadPrompt } from "../prompts.js";
import { AGENT_IDS } from "./ids.js";
import { SPECOPS_AUTO_REPLICATE_PERMISSION } from "./permissions.js";
import type { SpecOpsConfig } from "../config.js";

/**
 * OpenCode subagent ID used by the Coordinator to delegate technical design
 * artifact authorship.
 */
export const DESIGNER_AGENT_ID = AGENT_IDS.designer;

/**
 * Register the SpecOps designer subagent using the persisted designer role config.
 *
 * A blank designer model is preserved as the semantic "use the invoking primary
 * agent's model": the `model` and `variant` fields are omitted from the agent config.
 * The designer is registered separately so design ownership remains distinct
 * from planning and implementation ownership.
 *
 * @param config OpenCode configuration object mutated with the subagent.
 * @param specOpsConfig Validated persisted role-to-model configuration.
 */
export function registerDesignerAgent(config: Config, specOpsConfig: SpecOpsConfig): void {
    config.agent ??= {};
    const designer = specOpsConfig.agents[AGENT_IDS.designer];
    const model = designer.model?.trim();

    config.agent[DESIGNER_AGENT_ID] = {
        description:
            "Authors the technical OpenSpec design from approved requirements and repository " +
            "evidence. Use this agent to create design.md for SpecOps changes.",
        mode: "subagent",
        prompt: loadPrompt(AGENT_IDS.designer),
        permission: { ...SPECOPS_AUTO_REPLICATE_PERMISSION },
        ...(model ? { model, ...(designer.variant ? { variant: designer.variant } : {}) } : {}),
    };
}
