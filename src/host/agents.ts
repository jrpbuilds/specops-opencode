import type { Config } from "@opencode-ai/plugin";
import type { SpecOpsAgentDefinition } from "../agents/definition.js";
import type { SpecOpsConfig } from "../config.js";
import {
    autoCoordinatorAgentDefinition,
    interactiveCoordinatorAgentDefinition,
} from "../agents/coordinator.js";
import { explorerAgentDefinition } from "../agents/explorer.js";
import { plannerAgentDefinition } from "../agents/planner.js";
import { designerAgentDefinition } from "../agents/designer.js";
import { implementerAgentDefinition } from "../agents/implementer.js";
import { reviewerAgentDefinition } from "../agents/reviewer.js";
import { frontierAgentDefinition } from "../agents/frontier.js";

/**
 * Translate one host-neutral agent definition into OpenCode 1's registration
 * shape.
 *
 * This is the single site where a definition becomes a `Config["agent"]`
 * entry: the SDK's narrower permission and entry types are narrower than the
 * neutral record, so one documented cast replaces the per-module casts this
 * boundary replaces. Blank model selections were already omitted at
 * definition-build time, preserving "use the invoking primary agent's model".
 *
 * @param config Host configuration object mutated in place.
 * @param definition Neutral SpecOps role definition to register.
 */
export function applyAgentDefinition(config: Config, definition: SpecOpsAgentDefinition): void {
    config.agent ??= {};
    const { id, ...rest } = definition;
    config.agent[id] = {
        ...rest,
    } as NonNullable<Config["agent"]>[string];
}

/**
 * Register the interactive SpecOps primary agent from its neutral definition.
 *
 * @param config OpenCode configuration object mutated with the primary agent.
 * @param specOpsConfig Validated persisted role-to-model configuration.
 */
export function registerCoordinatorAgent(config: Config, specOpsConfig: SpecOpsConfig): void {
    applyAgentDefinition(config, interactiveCoordinatorAgentDefinition(specOpsConfig));
}

/**
 * Register the autonomous SpecOps Auto primary agent from its neutral definition.
 *
 * @param config OpenCode configuration object mutated with the primary agent.
 * @param specOpsConfig Validated persisted role-to-model configuration.
 */
export function registerAutoCoordinatorAgent(config: Config, specOpsConfig: SpecOpsConfig): void {
    applyAgentDefinition(config, autoCoordinatorAgentDefinition(specOpsConfig));
}

/**
 * Register the SpecOps explorer subagent from its neutral definition.
 *
 * @param config OpenCode configuration object mutated with the subagent.
 * @param specOpsConfig Validated persisted role-to-model configuration.
 */
export function registerExplorerAgent(config: Config, specOpsConfig: SpecOpsConfig): void {
    applyAgentDefinition(config, explorerAgentDefinition(specOpsConfig));
}

/**
 * Register the SpecOps planner subagent from its neutral definition.
 *
 * @param config OpenCode configuration object mutated with the subagent.
 * @param specOpsConfig Validated persisted role-to-model configuration.
 */
export function registerPlannerAgent(config: Config, specOpsConfig: SpecOpsConfig): void {
    applyAgentDefinition(config, plannerAgentDefinition(specOpsConfig));
}

/**
 * Register the SpecOps designer subagent from its neutral definition.
 *
 * @param config OpenCode configuration object mutated with the subagent.
 * @param specOpsConfig Validated persisted role-to-model configuration.
 */
export function registerDesignerAgent(config: Config, specOpsConfig: SpecOpsConfig): void {
    applyAgentDefinition(config, designerAgentDefinition(specOpsConfig));
}

/**
 * Register the SpecOps implementer subagent from its neutral definition.
 *
 * @param config OpenCode configuration object mutated with the subagent.
 * @param specOpsConfig Validated persisted role-to-model configuration.
 */
export function registerImplementerAgent(config: Config, specOpsConfig: SpecOpsConfig): void {
    applyAgentDefinition(config, implementerAgentDefinition(specOpsConfig));
}

/**
 * Register the SpecOps reviewer subagent from its neutral definition.
 *
 * @param config OpenCode configuration object mutated with the subagent.
 * @param specOpsConfig Validated persisted role-to-model configuration.
 */
export function registerReviewerAgent(config: Config, specOpsConfig: SpecOpsConfig): void {
    applyAgentDefinition(config, reviewerAgentDefinition(specOpsConfig));
}

/**
 * Register the SpecOps frontier subagent from its neutral definition.
 *
 * Only called when the frontier escalation capability is enabled.
 *
 * @param config OpenCode configuration object mutated with the subagent.
 * @param specOpsConfig Validated persisted role-to-model configuration.
 */
export function registerFrontierAgent(config: Config, specOpsConfig: SpecOpsConfig): void {
    applyAgentDefinition(config, frontierAgentDefinition(specOpsConfig));
}
