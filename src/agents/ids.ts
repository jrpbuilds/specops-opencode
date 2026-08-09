/**
 * Stable identifiers for every role that can receive an explicit model.
 *
 * These values are persisted in configuration and used as the shared naming
 * contract between prompts, agent registration, and the configuration UI.
 */
export const AGENT_IDS = {
    coordinator: "specops-coordinator",
    explorer: "specops-explorer",
    planner: "specops-planner",
    designer: "specops-designer",
    implementer: "specops-implementer",
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
 * All configurable roles in the display and validation order used by SpecOps.
 *
 * Keeping this derived from `AGENT_IDS` prevents the UI and config validator
 * from drifting apart when a role is added or renamed.
 */
export const ALL_AGENT_IDS = Object.values(AGENT_IDS) as readonly AgentId[];
