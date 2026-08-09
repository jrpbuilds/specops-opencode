import type { Config } from "@opencode-ai/plugin";
import { loadPrompt } from "../prompts.js";
import { AGENT_IDS } from "./ids.js";
import type { SpecOpsConfig } from "../config.js";

/**
 * OpenCode subagent ID used by the Coordinator to delegate independent final
 * review.
 */
export const REVIEWER_AGENT_ID = AGENT_IDS.reviewer;

/**
 * Register the SpecOps reviewer subagent using the persisted reviewer role config.
 *
 * A blank reviewer model is preserved as the semantic "use the invoking primary
 * agent's model": the `model` and `variant` fields are omitted from the agent config.
 * The reviewer remains a verification-only subagent; lifecycle actions such as
 * archiving stay with the Coordinator and the deterministic tools.
 *
 * @param config OpenCode configuration object mutated with the subagent.
 * @param specOpsConfig Validated persisted role-to-model configuration.
 */
export function registerReviewerAgent(config: Config, specOpsConfig: SpecOpsConfig): void {
    config.agent ??= {};
    const reviewer = specOpsConfig.agents[AGENT_IDS.reviewer];
    const model = reviewer.model?.trim();

    config.agent[REVIEWER_AGENT_ID] = {
        description:
            "Independently verifies implemented OpenSpec changes against requirements, design, " +
            "tasks, source code, and tests. Use this agent as the final SpecOps quality gate " +
            "before completion.",
        mode: "subagent",
        prompt: loadPrompt(AGENT_IDS.reviewer),
        ...(model ? { model, ...(reviewer.variant ? { variant: reviewer.variant } : {}) } : {}),
    };
}
