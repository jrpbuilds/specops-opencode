import { loadPrompt } from "../prompts.js";
import { AGENT_IDS } from "./ids.js";
import { IMPLEMENTER_PERMISSION } from "./permissions.js";
import type { SpecOpsConfig } from "../config.js";
import type { SpecOpsAgentDefinition } from "./definition.js";

/**
 * Subagent ID used by the Coordinator to delegate approved task implementation
 * and verification.
 */
export const IMPLEMENTER_AGENT_ID = AGENT_IDS.implementer;

/**
 * Build the SpecOps implementer subagent definition using the persisted
 * implementer role config.
 *
 * A blank implementer model is preserved as the semantic "use the invoking
 * primary agent's model": the `model` and `variant` fields are omitted from the
 * definition. The registered prompt defines the workflow boundary, while the
 * permission profile supplies the implementer's runtime capabilities.
 *
 * @param specOpsConfig Validated persisted role-to-model configuration.
 */
export function implementerAgentDefinition(specOpsConfig: SpecOpsConfig): SpecOpsAgentDefinition {
    const implementer = specOpsConfig.agents[AGENT_IDS.implementer];
    const model = implementer.model?.trim();

    return {
        id: IMPLEMENTER_AGENT_ID,
        description:
            "Implements approved OpenSpec tasks in source and tests, runs verification, and " +
            "marks completed tasks in tasks.md. Use this agent to execute SpecOps " +
            "implementation plans.",
        mode: "subagent",
        hidden: true,
        prompt: loadPrompt(AGENT_IDS.implementer),
        permission: IMPLEMENTER_PERMISSION,
        ...(model
            ? { model, ...(implementer.variant ? { variant: implementer.variant } : {}) }
            : {}),
    };
}
