import type { Config } from "@opencode-ai/plugin";
import { loadPrompt, loadPromptFile } from "../prompts.js";
import { AGENT_IDS } from "./ids.js";
import type { SpecOpsConfig } from "../config.js";

type RegisteredAgentConfig = NonNullable<NonNullable<Config["agent"]>[string]>;
type CoordinatorAgentConfig = Omit<RegisteredAgentConfig, "permission"> & {
    permission: { question: "allow" | "deny" };
};

/**
 * Visible primary-agent key presented in OpenCode's agent selector.
 *
 * This display name is intentionally distinct from the persisted role ID in
 * `AGENT_IDS`; OpenCode uses it to identify the plugin's primary entry point.
 */
export const SPECOPS_AGENT_ID = "SpecOps";

/**
 * Visible primary-agent key for the autonomous SpecOps Auto coordinator.
 *
 * This agent shares the coordinator role's model config and the shared
 * coordinator prompt, appending the autonomous appendix so headless runs
 * execute without human checkpoints. It is not a configurable role, so it has
 * no entry in `AGENT_IDS`.
 */
export const SPECOPS_AUTO_AGENT_ID = "SpecOps Auto";

/**
 * Substitute the Frontier escalation state into the Coordinator prompt.
 *
 * Prompt includes are resolved by `src/prompts.ts` when the prompt is loaded.
 * This helper then replaces the `{{FRONTIER_ESCALATION_STATE}}` placeholder
 * with either `enabled` or `disabled` so the Coordinator prompt contract is
 * concrete for the current session. It is the only mutation applied after
 * prompt loading; the include syntax remains a deliberately small,
 * whole-line-only mechanism without parameters or conditionals.
 */
export function applyFrontierState(prompt: string, frontierEscalation: boolean): string {
    return prompt.replace(
        "{{FRONTIER_ESCALATION_STATE}}",
        frontierEscalation ? "enabled" : "disabled",
    );
}

/**
 * Register the interactive SpecOps primary agent.
 *
 * The loaded coordinator prompt has the current `frontierEscalation` state
 * substituted so the Coordinator prompt contract is concrete for the session.
 * A blank coordinator model is preserved as the semantic "use OpenCode's
 * global default": the `model` and `variant` fields are omitted from the agent
 * config. The explicit question permission guarantees that this custom primary
 * agent can use OpenCode's native interactive question tool across runtime
 * defaults.
 *
 * @param config OpenCode configuration object mutated with the primary agent.
 * @param specOpsConfig Validated persisted role-to-model configuration.
 */
export function registerCoordinatorAgent(config: Config, specOpsConfig: SpecOpsConfig): void {
    config.agent ??= {};
    const coordinator = specOpsConfig.agents[AGENT_IDS.coordinator];
    const model = coordinator.model?.trim();

    const agent: CoordinatorAgentConfig = {
        description: "SpecOps coordinator for spec-driven development",
        mode: "primary",
        prompt: applyFrontierState(
            loadPrompt(AGENT_IDS.coordinator),
            specOpsConfig.frontierEscalation,
        ),
        permission: { question: "allow" },
        ...(model
            ? { model, ...(coordinator.variant ? { variant: coordinator.variant } : {}) }
            : {}),
    };
    config.agent[SPECOPS_AGENT_ID] = agent as RegisteredAgentConfig;
}

/**
 * Register the autonomous SpecOps Auto primary agent.
 *
 * The prompt is the shared coordinator prompt with the autonomous appendix
 * appended, so both coordinators follow the same workflow while only the Auto
 * variant overrides the human checkpoints. The question permission is denied
 * at the runtime layer, making an accidental interactive checkpoint call
 * impossible in headless runs. The Auto agent reuses the coordinator role's
 * model config; it is not a separately configurable role.
 *
 * @param config OpenCode configuration object mutated with the primary agent.
 * @param specOpsConfig Validated persisted role-to-model configuration.
 */
export function registerAutoCoordinatorAgent(config: Config, specOpsConfig: SpecOpsConfig): void {
    config.agent ??= {};
    const coordinator = specOpsConfig.agents[AGENT_IDS.coordinator];
    const model = coordinator.model?.trim();

    const agent: CoordinatorAgentConfig = {
        description:
            "Autonomous SpecOps coordinator for headless runs: executes the SpecOps workflow " +
            "without human checkpoints. Use via the specops-auto command.",
        mode: "primary",
        prompt: applyFrontierState(
            loadPrompt(AGENT_IDS.coordinator) + "\n\n" + loadPromptFile("coordinator-auto.md"),
            specOpsConfig.frontierEscalation,
        ),
        permission: { question: "deny" },
        ...(model
            ? { model, ...(coordinator.variant ? { variant: coordinator.variant } : {}) }
            : {}),
    };
    config.agent[SPECOPS_AUTO_AGENT_ID] = agent as RegisteredAgentConfig;
}
