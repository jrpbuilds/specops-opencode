import type { Config } from "@opencode-ai/plugin";
import { loadPrompt } from "../prompts.js";
import { AGENT_IDS } from "./ids.js";
import type { SpecOpsConfig } from "../config.js";

/** Visible primary agent key presented in OpenCode's agent selector. */
export const SPECOPS_AGENT_ID = "SpecOps";

/**
 * Register the SpecOps primary agent using the persisted coordinator role config.
 *
 * A blank coordinator model is preserved as the semantic "use OpenCode's global
 * default": the `model` and `variant` fields are omitted from the agent config.
 */
export function registerCoordinatorAgent(config: Config, specOpsConfig: SpecOpsConfig): void {
    config.agent ??= {};
    const coordinator = specOpsConfig.agents[AGENT_IDS.coordinator];
    const model = coordinator.model?.trim();

    config.agent[SPECOPS_AGENT_ID] = {
        description: "SpecOps coordinator for spec-driven development",
        mode: "primary",
        prompt: loadPrompt(AGENT_IDS.coordinator),
        ...(model
            ? { model, ...(coordinator.variant ? { variant: coordinator.variant } : {}) }
            : {}),
    };
}
