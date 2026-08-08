import type { Config } from "@opencode-ai/plugin";
import { loadPrompt } from "../prompts.js";
import { AGENT_IDS } from "./ids.js";
import type { SpecOpsConfig } from "../config.js";

/** OpenCode subagent id used by the coordinator to delegate exploration. */
export const EXPLORER_AGENT_ID = AGENT_IDS.explorer;

/**
 * Register the SpecOps explorer subagent using the persisted explorer role config.
 *
 * A blank explorer model is preserved as the semantic "use the invoking primary
 * agent's model": the `model` and `variant` fields are omitted from the agent config.
 */
export function registerExplorerAgent(config: Config, specOpsConfig: SpecOpsConfig): void {
    config.agent ??= {};
    const explorer = specOpsConfig.agents[AGENT_IDS.explorer];
    const model = explorer.model?.trim();

    config.agent[EXPLORER_AGENT_ID] = {
        description:
            "Investigates repository source code, existing behaviour, structure, conventions, " +
            "tests, constraints and risks for the SpecOps coordinator. Use this agent for all " +
            "codebase exploration.",
        mode: "subagent",
        prompt: loadPrompt(AGENT_IDS.explorer),
        ...(model ? { model, ...(explorer.variant ? { variant: explorer.variant } : {}) } : {}),
    };
}
