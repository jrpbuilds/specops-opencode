import type { Config } from "@opencode-ai/plugin";
import { loadPrompt } from "../prompts.js";
import { AGENT_IDS } from "./ids.js";
import { EXPLORER_PERMISSION, type RolePermission } from "./permissions.js";
import type { SpecOpsConfig } from "../config.js";

/**
 * OpenCode subagent ID used by the Coordinator to delegate repository
 * exploration and evidence gathering.
 */
export const EXPLORER_AGENT_ID = AGENT_IDS.explorer;

/**
 * Register the SpecOps explorer subagent using the persisted explorer role config.
 *
 * A blank explorer model is preserved as the semantic "use the invoking primary
 * agent's model": the `model` and `variant` fields are omitted from the agent config.
 * The registered description and prompt keep this role focused on investigation
 * rather than planning or implementation.
 *
 * @param config OpenCode configuration object mutated with the subagent.
 * @param specOpsConfig Validated persisted role-to-model configuration.
 */
export function registerExplorerAgent(config: Config, specOpsConfig: SpecOpsConfig): void {
    config.agent ??= {};
    const explorer = specOpsConfig.agents[AGENT_IDS.explorer];
    const model = explorer.model?.trim();

    config.agent[EXPLORER_AGENT_ID] = {
        description:
            "Investigates repository source, behavior, conventions, tests, constraints, and " +
            "risks for planning and design. Use when the SpecOps coordinator needs focused " +
            "repository evidence.",
        mode: "subagent",
        hidden: true,
        permission: EXPLORER_PERMISSION as unknown as RolePermission,
        prompt: loadPrompt(AGENT_IDS.explorer),
        ...(model ? { model, ...(explorer.variant ? { variant: explorer.variant } : {}) } : {}),
    };
}
