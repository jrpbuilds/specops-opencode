import { loadPrompt, loadPromptFile } from "../prompts.js";
import { AGENT_IDS } from "./ids.js";
import { ORCHESTRATOR_PERMISSION, SPECOPS_TASK_ALLOW } from "./permissions.js";
import type { SpecOpsConfig } from "../config.js";
import type { SpecOpsAgentDefinition } from "./definition.js";

/** Runtime mode selecting which orchestrator prompt and checkpoint policy apply. */
export type OrchestratorMode = "interactive" | "auto";

/** Visible primary-agent key presented in OpenCode's agent selector. */
export const SPECOPS_AGENT_ID = "SpecOps";

/** Visible primary-agent key for the autonomous SpecOps Auto orchestrator. */
export const SPECOPS_AUTO_AGENT_ID = "SpecOps Auto";

/**
 * Build one coherent orchestrator prompt for the selected runtime mode.
 *
 * Interactive and Auto policies are mutually exclusive. Frontier policy is
 * included only when the feature is enabled, keeping disabled policy out of
 * the model context.
 *
 * Orchestrator-visible numeric policy — the Auto review-remediation budget and
 * the subagent concurrency cap — is read from the `specops_config` tool at
 * workflow initialization rather than baked into the prompt. Keeping these
 * values out of static prompt construction decouples prompt shape from config
 * shape and lets orchestrator logic read the effective snapshot that produced
 * the currently-registered agents.
 */
export function buildOrchestratorPrompt(
    mode: OrchestratorMode,
    frontierEscalation: boolean,
): string {
    const modePrompt = loadPromptFile(
        mode === "interactive" ? "orchestrator-interactive.md" : "orchestrator-auto.md",
    );
    const fragments = [loadPrompt(AGENT_IDS.orchestrator), modePrompt];

    if (frontierEscalation) {
        fragments.push(loadPromptFile("orchestrator-frontier.md"));
    }

    return fragments.join("\n\n");
}

/** Model/variant fields from the shared orchestrator role config, omitted when blank. */
function orchestratorModelFields(specOpsConfig: SpecOpsConfig) {
    const orchestrator = specOpsConfig.agents[AGENT_IDS.orchestrator];
    const model = orchestrator.model?.trim();
    return model
        ? { model, ...(orchestrator.variant ? { variant: orchestrator.variant } : {}) }
        : {};
}

/**
 * Build the interactive SpecOps primary agent definition.
 *
 * A blank orchestrator model means "use OpenCode's global default", so model
 * and variant fields are omitted. Native question permission is explicitly
 * allowed because this mode owns plan, decision, and lifecycle checkpoints.
 *
 * The runtime loop guard is intentionally NOT pinned here: an interactive
 * session has a human present, so OpenCode's configured default (`ask`)
 * governs loop detection instead of a silent abort.
 */
export function interactiveOrchestratorAgentDefinition(
    specOpsConfig: SpecOpsConfig,
): SpecOpsAgentDefinition {
    return {
        id: SPECOPS_AGENT_ID,
        description: "SpecOps orchestrator for spec-driven development",
        mode: "primary",
        prompt: buildOrchestratorPrompt("interactive", specOpsConfig.frontierEscalation),
        permission: {
            ...ORCHESTRATOR_PERMISSION,
            question: "allow",
            task: SPECOPS_TASK_ALLOW,
        },
        ...orchestratorModelFields(specOpsConfig),
    };
}

/**
 * Build the autonomous SpecOps Auto primary agent definition.
 *
 * Auto receives the shared workflow plus only the autonomous policy. Runtime
 * question denial provides a second hard boundary against accidental human
 * checkpoints in headless operation. Auto shares the orchestrator model config.
 *
 * The runtime loop guard is pinned to deny because headless runs cannot answer
 * permission asks (opencode#35073, #12566, #30527): an ask would deadlock the
 * run, so detection ends the turn deterministically instead.
 */
export function autoOrchestratorAgentDefinition(
    specOpsConfig: SpecOpsConfig,
): SpecOpsAgentDefinition {
    return {
        id: SPECOPS_AUTO_AGENT_ID,
        description:
            "Autonomous SpecOps orchestrator for headless runs: executes the SpecOps workflow " +
            "without human checkpoints. Use via the specops-auto command.",
        mode: "primary",
        prompt: buildOrchestratorPrompt("auto", specOpsConfig.frontierEscalation),
        permission: {
            ...ORCHESTRATOR_PERMISSION,
            question: "deny",
            task: SPECOPS_TASK_ALLOW,
            doom_loop: "deny",
        },
        ...orchestratorModelFields(specOpsConfig),
    };
}
