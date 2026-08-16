import type { Config } from "@opencode-ai/plugin";
import { loadPrompt, loadPromptFile } from "../prompts.js";
import { AGENT_IDS } from "./ids.js";
import { COORDINATOR_PERMISSION, SPECOPS_TASK_ALLOW, type RolePermission } from "./permissions.js";
import type { SpecOpsConfig } from "../config.js";

type RegisteredAgentConfig = NonNullable<NonNullable<Config["agent"]>[string]>;
type CoordinatorAgentConfig = Omit<RegisteredAgentConfig, "permission"> & {
    permission: RolePermission;
};

export type CoordinatorMode = "interactive" | "auto";

/** Visible primary-agent key presented in OpenCode's agent selector. */
export const SPECOPS_AGENT_ID = "SpecOps";

/** Visible primary-agent key for the autonomous SpecOps Auto coordinator. */
export const SPECOPS_AUTO_AGENT_ID = "SpecOps Auto";

/**
 * Build one coherent coordinator prompt for the selected runtime mode.
 *
 * Interactive and Auto policies are mutually exclusive. Frontier policy is
 * included only when the feature is enabled, keeping disabled policy out of
 * the model context instead of relying on prompt-time overrides/placeholders.
 */
export function buildCoordinatorPrompt(mode: CoordinatorMode, frontierEscalation: boolean): string {
    const fragments = [
        loadPrompt(AGENT_IDS.coordinator),
        loadPromptFile(
            mode === "interactive" ? "coordinator-interactive.md" : "coordinator-auto.md",
        ),
    ];

    if (frontierEscalation) {
        fragments.push(loadPromptFile("coordinator-frontier.md"));
    }

    return fragments.join("\n\n");
}

/**
 * Register the interactive SpecOps primary agent.
 *
 * A blank coordinator model means "use OpenCode's global default", so model
 * and variant fields are omitted. Native question permission is explicitly
 * allowed because this mode owns plan, decision, and lifecycle checkpoints.
 */
export function registerCoordinatorAgent(config: Config, specOpsConfig: SpecOpsConfig): void {
    config.agent ??= {};
    const coordinator = specOpsConfig.agents[AGENT_IDS.coordinator];
    const model = coordinator.model?.trim();

    const agent: CoordinatorAgentConfig = {
        description: "SpecOps coordinator for spec-driven development",
        mode: "primary",
        prompt: buildCoordinatorPrompt("interactive", specOpsConfig.frontierEscalation),
        permission: {
            ...COORDINATOR_PERMISSION,
            question: "allow",
            task: SPECOPS_TASK_ALLOW,
        } as unknown as RolePermission,
        ...(model
            ? { model, ...(coordinator.variant ? { variant: coordinator.variant } : {}) }
            : {}),
    };
    config.agent[SPECOPS_AGENT_ID] = agent as RegisteredAgentConfig;
}

/**
 * Register the autonomous SpecOps Auto primary agent.
 *
 * Auto receives the shared workflow plus only the autonomous policy. Runtime
 * question denial provides a second hard boundary against accidental human
 * checkpoints in headless operation. Auto shares the coordinator model config.
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
        prompt: buildCoordinatorPrompt("auto", specOpsConfig.frontierEscalation),
        permission: {
            ...COORDINATOR_PERMISSION,
            question: "deny",
            task: SPECOPS_TASK_ALLOW,
        } as unknown as RolePermission,
        ...(model
            ? { model, ...(coordinator.variant ? { variant: coordinator.variant } : {}) }
            : {}),
    };
    config.agent[SPECOPS_AUTO_AGENT_ID] = agent as RegisteredAgentConfig;
}
