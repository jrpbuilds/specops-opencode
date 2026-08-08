import type { Config } from "@opencode-ai/plugin";
import { loadPrompt } from "../prompts.js";
import { AGENT_IDS } from "./ids.js";
import type { SpecOpsConfig } from "../config.js";

/** OpenCode subagent id used by the coordinator to delegate design artifact authorship. */
export const DESIGNER_AGENT_ID = AGENT_IDS.designer;

/**
 * Register the SpecOps designer subagent using the persisted designer role config.
 *
 * A blank designer model is preserved as the semantic "use the invoking primary
 * agent's model": the `model` and `variant` fields are omitted from the agent config.
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
        ...(model ? { model, ...(designer.variant ? { variant: designer.variant } : {}) } : {}),
    };
}
