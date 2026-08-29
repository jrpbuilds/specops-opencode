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
import { reviewCorrectnessAgentDefinition } from "../agents/review-correctness.js";
import { reviewRiskAgentDefinition } from "../agents/review-risk.js";
import { reviewQualityAgentDefinition } from "../agents/review-quality.js";

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
 * One workflow subagent entry in the registration table.
 *
 * `buildDefinition` receives the effective configuration so definitions can
 * adapt their prompts; the host applies the role's model mapping uniformly.
 */
type SubagentRegistration = {
    id: AgentId;
    buildDefinition: (specOpsConfig: SpecOpsConfig) => SpecOpsAgentDefinition;
    /** Registration gate; the entry registers unconditionally when omitted. */
    when?: (specOpsConfig: SpecOpsConfig) => boolean;
};

/**
 * Every workflow subagent registration, in workflow order.
 *
 * Adding a role means adding one entry here (plus its id in `AGENT_IDS` and its
 * metadata in `ROLE_META`); `registerWorkflowSubagents` applies model mapping
 * and host translation for every entry.
 */
const SUBAGENT_REGISTRATIONS: readonly SubagentRegistration[] = [
    { id: AGENT_IDS.explorer, buildDefinition: explorerAgentDefinition },
    { id: AGENT_IDS.planner, buildDefinition: plannerAgentDefinition },
    { id: AGENT_IDS.designer, buildDefinition: designerAgentDefinition },
    { id: AGENT_IDS.implementer, buildDefinition: implementerAgentDefinition },
    { id: AGENT_IDS.reviewer, buildDefinition: reviewerAgentDefinition },
    { id: AGENT_IDS.reviewCorrectness, buildDefinition: reviewCorrectnessAgentDefinition },
    { id: AGENT_IDS.reviewRisk, buildDefinition: reviewRiskAgentDefinition },
    { id: AGENT_IDS.reviewQuality, buildDefinition: reviewQualityAgentDefinition },
    {
        id: AGENT_IDS.frontier,
        buildDefinition: frontierAgentDefinition,
        when: specOpsConfig => specOpsConfig.frontierEscalation,
    },
];

/**
 * Register every workflow subagent from the shared table.
 *
 * Entries whose gate is false — today only the frontier role, gated on
 * `frontierEscalation` — are skipped; the rest register through the same
 * model-mapping resolver.
 *
 * @param config OpenCode configuration object mutated with the subagents.
 * @param specOpsConfig Validated persisted role-to-model configuration.
 */
export function registerWorkflowSubagents(config: Config, specOpsConfig: SpecOpsConfig): void {
    for (const { id, buildDefinition, when } of SUBAGENT_REGISTRATIONS) {
        if (when && !when(specOpsConfig)) continue;
        applyConfiguredAgent(config, specOpsConfig, id, buildDefinition(specOpsConfig));
    }
}
