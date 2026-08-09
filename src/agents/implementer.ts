import type { Config } from "@opencode-ai/plugin";
import { loadPrompt } from "../prompts.js";
import { AGENT_IDS } from "./ids.js";
import type { SpecOpsConfig } from "../config.js";

/** OpenCode subagent id used by the coordinator to delegate implementation. */
export const IMPLEMENTER_AGENT_ID = AGENT_IDS.implementer;

/**
 * Register the SpecOps implementer subagent using the persisted implementer role config.
 *
 * A blank implementer model is preserved as the semantic "use the invoking primary
 * agent's model": the `model` and `variant` fields are omitted from the agent config.
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
        prompt: loadPrompt(AGENT_IDS.implementer),
        ...(model
            ? { model, ...(implementer.variant ? { variant: implementer.variant } : {}) }
            : {}),
    };
}
