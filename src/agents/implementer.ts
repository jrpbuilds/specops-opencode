import type { Config } from "@opencode-ai/plugin";
import { loadPrompt } from "../prompts.js";
import { AGENT_IDS } from "./ids.js";
import { IMPLEMENTER_PERMISSION, type RolePermission } from "./permissions.js";
import type { SpecOpsConfig } from "../config.js";

/**
 * OpenCode subagent ID used by the Coordinator to delegate approved task
 * implementation and verification.
 */
export const IMPLEMENTER_AGENT_ID = AGENT_IDS.implementer;

/**
 * Register the SpecOps implementer subagent using the persisted implementer role config.
 *
 * A blank implementer model is preserved as the semantic "use the invoking primary
 * agent's model": the `model` and `variant` fields are omitted from the agent config.
 * The registered prompt defines the workflow boundary, while the native
 * permission profile supplies the implementer's runtime capabilities. This
 * module attaches both to the OpenCode registration and selects its model.
 *
 * @param config OpenCode configuration object mutated with the subagent.
 * @param specOpsConfig Validated persisted role-to-model configuration.
 */
export function registerImplementerAgent(config: Config, specOpsConfig: SpecOpsConfig): void {
    config.agent ??= {};
    const implementer = specOpsConfig.agents[AGENT_IDS.implementer];
    const model = implementer.model?.trim();

    config.agent[IMPLEMENTER_AGENT_ID] = {
        description:
            "Implements approved OpenSpec tasks in source and tests, runs verification, and " +
            "marks completed tasks in tasks.md. Use this agent to execute SpecOps " +
            "implementation plans.",
        mode: "subagent",
        hidden: true,
        prompt: loadPrompt(AGENT_IDS.implementer),
        permission: IMPLEMENTER_PERMISSION as unknown as RolePermission,
        ...(model
            ? { model, ...(implementer.variant ? { variant: implementer.variant } : {}) }
            : {}),
    };
}
