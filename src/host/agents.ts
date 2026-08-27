import type { Config } from "@opencode-ai/plugin";
import type { SpecOpsAgentDefinition } from "../agents/definition.js";
import type { SpecOpsConfig } from "../config.js";
import { resolveAgentMapping } from "../models.js";
import { AGENT_IDS, type AgentId } from "../agents/ids.js";
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
import {
    reviewCorrectnessAgentDefinition,
    REVIEW_CORRECTNESS_AGENT_ID,
} from "../agents/review-correctness.js";
import { reviewRiskAgentDefinition, REVIEW_RISK_AGENT_ID } from "../agents/review-risk.js";
import { reviewQualityAgentDefinition, REVIEW_QUALITY_AGENT_ID } from "../agents/review-quality.js";

/**
 * Apply one role definition with its shared effective model mapping.
 *
 * Definitions still describe their role independently, but the host owns the
 * final mapping application so every registered role uses the same resolver.
 */
function applyConfiguredAgent(
    config: Config,
    specOpsConfig: SpecOpsConfig,
    roleId: AgentId,
    definition: SpecOpsAgentDefinition,
): void {
    const resolvedDefinition = { ...definition };
    delete resolvedDefinition.model;
    delete resolvedDefinition.variant;

    const mapping = resolveAgentMapping(specOpsConfig, roleId);
    const model = mapping.model?.trim();
    if (model) {
        resolvedDefinition.model = model;
        if (mapping.variant) resolvedDefinition.variant = mapping.variant;
    }

    applyAgentDefinition(config, resolvedDefinition);
}

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
    applyConfiguredAgent(
        config,
        specOpsConfig,
        AGENT_IDS.explorer,
        explorerAgentDefinition(specOpsConfig),
    );
}

/**
 * Register the SpecOps planner subagent from its neutral definition.
 *
 * @param config OpenCode configuration object mutated with the subagent.
 * @param specOpsConfig Validated persisted role-to-model configuration.
 */
export function registerPlannerAgent(config: Config, specOpsConfig: SpecOpsConfig): void {
    applyConfiguredAgent(
        config,
        specOpsConfig,
        AGENT_IDS.planner,
        plannerAgentDefinition(specOpsConfig),
    );
}

/**
 * Register the SpecOps designer subagent from its neutral definition.
 *
 * @param config OpenCode configuration object mutated with the subagent.
 * @param specOpsConfig Validated persisted role-to-model configuration.
 */
export function registerDesignerAgent(config: Config, specOpsConfig: SpecOpsConfig): void {
    applyConfiguredAgent(
        config,
        specOpsConfig,
        AGENT_IDS.designer,
        designerAgentDefinition(specOpsConfig),
    );
}

/**
 * Register the SpecOps implementer subagent from its neutral definition.
 *
 * @param config OpenCode configuration object mutated with the subagent.
 * @param specOpsConfig Validated persisted role-to-model configuration.
 */
export function registerImplementerAgent(config: Config, specOpsConfig: SpecOpsConfig): void {
    applyConfiguredAgent(
        config,
        specOpsConfig,
        AGENT_IDS.implementer,
        implementerAgentDefinition(specOpsConfig),
    );
}

/**
 * Register the SpecOps reviewer subagent from its neutral definition.
 *
 * @param config OpenCode configuration object mutated with the subagent.
 * @param specOpsConfig Validated persisted role-to-model configuration.
 */
export function registerReviewerAgent(config: Config, specOpsConfig: SpecOpsConfig): void {
    applyConfiguredAgent(
        config,
        specOpsConfig,
        AGENT_IDS.reviewer,
        reviewerAgentDefinition(specOpsConfig),
    );
}

/** Register the hidden correctness review specialist. */
export function registerReviewCorrectnessAgent(config: Config, specOpsConfig: SpecOpsConfig): void {
    applyConfiguredAgent(
        config,
        specOpsConfig,
        REVIEW_CORRECTNESS_AGENT_ID,
        reviewCorrectnessAgentDefinition(specOpsConfig),
    );
}

/** Register the hidden risk review specialist. */
export function registerReviewRiskAgent(config: Config, specOpsConfig: SpecOpsConfig): void {
    applyConfiguredAgent(
        config,
        specOpsConfig,
        REVIEW_RISK_AGENT_ID,
        reviewRiskAgentDefinition(specOpsConfig),
    );
}

/** Register the hidden quality review specialist. */
export function registerReviewQualityAgent(config: Config, specOpsConfig: SpecOpsConfig): void {
    applyConfiguredAgent(
        config,
        specOpsConfig,
        REVIEW_QUALITY_AGENT_ID,
        reviewQualityAgentDefinition(specOpsConfig),
    );
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
    applyConfiguredAgent(
        config,
        specOpsConfig,
        AGENT_IDS.frontier,
        frontierAgentDefinition(specOpsConfig),
    );
}
