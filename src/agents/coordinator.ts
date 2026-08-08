import type { Config } from "@opencode-ai/plugin";
import { AGENT_IDS } from "./ids.js";
import type { SpecOpsConfig } from "../config.js";

/** Visible primary agent key presented in OpenCode's agent selector. */
export const SPECOPS_AGENT_ID = "SpecOps";

/** Minimal bundled coordinator prompt proving the agent has its own identity. */
export const COORDINATOR_PROMPT = [
    "You are the SpecOps coordinator.",
    "",
    "Coordinate spec-driven development using OpenSpec and the available SpecOps tools and specialist agents.",
    "",
    "Do not implement source changes yourself. Determine what work is needed and delegate specialist work when appropriate.",
].join("\n");

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
        prompt: COORDINATOR_PROMPT,
        ...(model
            ? { model, ...(coordinator.variant ? { variant: coordinator.variant } : {}) }
            : {}),
    };
}
