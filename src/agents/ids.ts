/**
 * Stable identifiers for every role that can receive an explicit model.
 *
 * These values are persisted in configuration and used as the shared naming
 * contract between prompts, agent registration, and the configuration UI.
 */
export const AGENT_IDS = {
    orchestrator: "specops-orchestrator",
    explorer: "specops-explorer",
    planner: "specops-planner",
    designer: "specops-designer",
    implementer: "specops-implementer",
    reviewCorrectness: "specops-review-correctness",
    reviewRisk: "specops-review-risk",
    reviewQuality: "specops-review-quality",
    reviewer: "specops-reviewer",
    frontier: "specops-frontier",
} as const;

/**
 * A role identifier accepted by persisted configuration and agent settings.
 *
 * Restricting this type to `AGENT_IDS` keeps registration and configuration
 * lookups aligned at compile time.
 */
export type AgentId = (typeof AGENT_IDS)[keyof typeof AGENT_IDS];

/**
 * Configurable roles in the order used by the SpecOps workflow and editor.
 */
export const ROLE_WORKFLOW_ORDER = [
    AGENT_IDS.orchestrator,
    AGENT_IDS.explorer,
    AGENT_IDS.planner,
    AGENT_IDS.designer,
    AGENT_IDS.implementer,
    AGENT_IDS.reviewer,
    AGENT_IDS.reviewCorrectness,
    AGENT_IDS.reviewRisk,
    AGENT_IDS.reviewQuality,
    AGENT_IDS.frontier,
] as const satisfies readonly AgentId[];

/** All configurable roles used by configuration validation. */
export const ALL_AGENT_IDS = ROLE_WORKFLOW_ORDER;

/**
 * Roles that receive specialist dispatches from the orchestrator.
 *
 * Every Task dispatch to one of these roles carries the dispatch envelope's
 * `changeName` identity line, validated at the dispatch boundary. The
 * orchestrator dispatches specialists but never itself, so it is the one role
 * excluded here.
 */
export const SPECIALIST_AGENT_IDS: readonly AgentId[] = ROLE_WORKFLOW_ORDER.filter(
    id => id !== AGENT_IDS.orchestrator,
);
