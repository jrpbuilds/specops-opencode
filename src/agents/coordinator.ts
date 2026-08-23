import { loadPrompt, loadPromptFile } from "../prompts.js";
import { AGENT_IDS } from "./ids.js";
import { COORDINATOR_PERMISSION, SPECOPS_TASK_ALLOW } from "./permissions.js";
import type { SpecOpsConfig } from "../config.js";
import type { SpecOpsAgentDefinition } from "./definition.js";

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

function coordinatorModelFields(specOpsConfig: SpecOpsConfig) {
    const coordinator = specOpsConfig.agents[AGENT_IDS.coordinator];
    const model = coordinator.model?.trim();
    return model ? { model, ...(coordinator.variant ? { variant: coordinator.variant } : {}) } : {};
}

/**
 * Build the interactive SpecOps primary agent definition.
 *
 * A blank coordinator model means "use OpenCode's global default", so model
 * and variant fields are omitted. Native question permission is explicitly
 * allowed because this mode owns plan, decision, and lifecycle checkpoints.
 *
 * The runtime loop guard is intentionally NOT pinned here: an interactive
 * session has a human present, so OpenCode's configured default (`ask`)
 * governs loop detection instead of a silent abort.
 */
export function interactiveCoordinatorAgentDefinition(
    specOpsConfig: SpecOpsConfig,
): SpecOpsAgentDefinition {
    return {
        id: SPECOPS_AGENT_ID,
        description: "SpecOps coordinator for spec-driven development",
        mode: "primary",
        prompt: buildCoordinatorPrompt("interactive", specOpsConfig.frontierEscalation),
        permission: {
            ...COORDINATOR_PERMISSION,
            question: "allow",
            task: SPECOPS_TASK_ALLOW,
        },
        ...coordinatorModelFields(specOpsConfig),
    };
}

/**
 * Build the autonomous SpecOps Auto primary agent definition.
 *
 * Auto receives the shared workflow plus only the autonomous policy. Runtime
 * question denial provides a second hard boundary against accidental human
 * checkpoints in headless operation. Auto shares the coordinator model config.
 *
 * The runtime loop guard is pinned to deny because headless runs cannot answer
 * permission asks (opencode#35073, #12566, #30527): an ask would deadlock the
 * run, so detection ends the turn deterministically instead.
 */
export function autoCoordinatorAgentDefinition(
    specOpsConfig: SpecOpsConfig,
): SpecOpsAgentDefinition {
    return {
        id: SPECOPS_AUTO_AGENT_ID,
        description:
            "Autonomous SpecOps coordinator for headless runs: executes the SpecOps workflow " +
            "without human checkpoints. Use via the specops-auto command.",
        mode: "primary",
        prompt: buildCoordinatorPrompt("auto", specOpsConfig.frontierEscalation),
        permission: {
            ...COORDINATOR_PERMISSION,
            question: "deny",
            task: SPECOPS_TASK_ALLOW,
            doom_loop: "deny",
        },
        ...coordinatorModelFields(specOpsConfig),
    };
}
