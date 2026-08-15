import type { Config } from "@opencode-ai/plugin";
import { loadPrompt } from "../prompts.js";
import { AGENT_IDS } from "./ids.js";
import type { SpecOpsConfig } from "../config.js";

/**
 * OpenCode subagent ID used by the Coordinator to delegate genuinely difficult
 * technical blocker consultation.
 */
export const FRONTIER_AGENT_ID = AGENT_IDS.frontier;

/**
 * Register the SpecOps frontier subagent using the persisted frontier role config.
 *
 * A blank frontier model is preserved as the semantic "use the invoking primary
 * agent's model": the `model` and `variant` fields are omitted from the agent
 * config. The frontier is advice-only; it must not modify source, OpenSpec
 * artifacts, tasks, workflow state, review verdicts, or lifecycle state.
 *
 * This registration is gated by `frontierEscalation` in `src/index.ts`; it is
 * only called when the capability is enabled.
 *
 * @param config OpenCode configuration object mutated with the subagent.
 * @param specOpsConfig Validated persisted role-to-model configuration.
 */
export function registerFrontierAgent(config: Config, specOpsConfig: SpecOpsConfig): void {
    config.agent ??= {};
    const frontier = specOpsConfig.agents[AGENT_IDS.frontier];
    const model = frontier.model?.trim();

    config.agent[FRONTIER_AGENT_ID] = {
        description:
            "Advice-only consultation for genuinely difficult unresolved technical " +
            "blockers raised by SpecOps specialists. Returns technical advice only; does " +
            "not modify source, OpenSpec artifacts, tasks, workflow state, review " +
            "verdicts, or lifecycle state.",
        mode: "subagent",
        prompt: loadPrompt(AGENT_IDS.frontier),
        ...(model ? { model, ...(frontier.variant ? { variant: frontier.variant } : {}) } : {}),
    };
}
