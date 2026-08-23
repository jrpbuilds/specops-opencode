import { loadPrompt } from "../prompts.js";
import { AGENT_IDS } from "./ids.js";
import { FRONTIER_PERMISSION } from "./permissions.js";
import type { SpecOpsConfig } from "../config.js";
import type { SpecOpsAgentDefinition } from "./definition.js";

/**
 * Subagent ID used by the Coordinator to delegate genuinely difficult
 * technical blocker consultation.
 */
export const FRONTIER_AGENT_ID = AGENT_IDS.frontier;

/**
 * Build the SpecOps frontier subagent definition using the persisted frontier
 * role config.
 *
 * A blank frontier model is preserved as the semantic "use the invoking primary
 * agent's model": the `model` and `variant` fields are omitted from the
 * definition. The frontier is advice-only; it must not modify source, OpenSpec
 * artifacts, tasks, workflow state, review verdicts, or lifecycle state.
 *
 * Registration is gated by `frontierEscalation`; it is only applied when the
 * capability is enabled.
 *
 * @param specOpsConfig Validated persisted role-to-model configuration.
 */
export function frontierAgentDefinition(specOpsConfig: SpecOpsConfig): SpecOpsAgentDefinition {
    const frontier = specOpsConfig.agents[AGENT_IDS.frontier];
    const model = frontier.model?.trim();

    return {
        id: FRONTIER_AGENT_ID,
        description:
            "Advice-only consultation for genuinely difficult unresolved technical " +
            "blockers raised by SpecOps specialists. Returns technical advice only; does " +
            "not modify source, OpenSpec artifacts, tasks, workflow state, review " +
            "verdicts, or lifecycle state.",
        mode: "subagent",
        hidden: true,
        permission: FRONTIER_PERMISSION,
        prompt: loadPrompt(AGENT_IDS.frontier),
        ...(model ? { model, ...(frontier.variant ? { variant: frontier.variant } : {}) } : {}),
    };
}
