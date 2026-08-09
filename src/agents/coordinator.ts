import type { Config } from "@opencode-ai/plugin";
import { loadPrompt } from "../prompts.js";
import { AGENT_IDS } from "./ids.js";
import type { SpecOpsConfig } from "../config.js";

/**
 * Visible primary-agent key presented in OpenCode's agent selector.
 *
 * This display name is intentionally distinct from the persisted role ID in
 * `AGENT_IDS`; OpenCode uses it to identify the plugin's primary entry point.
 */
export const SPECOPS_AGENT_ID = "SpecOps";

/**
 * Register the SpecOps primary agent using the persisted coordinator role config.
 *
 * A blank coordinator model is preserved as the semantic "use OpenCode's global
 * default": the `model` and `variant` fields are omitted from the agent config.
 * The coordinator prompt is loaded from the packaged prompt catalogue so the
 * primary agent and its workflow instructions are registered together.
 *
 * @param config OpenCode configuration object mutated with the primary agent.
 * @param specOpsConfig Validated persisted role-to-model configuration.
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
