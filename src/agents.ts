/** The seven user-configurable SpecOps roles. */
export const AGENT_IDS = {
    coordinator: "specops-coordinator",
    explorer: "specops-explorer",
    planner: "specops-planner",
    designer: "specops-designer",
    implementer: "specops-implementer",
    reviewer: "specops-reviewer",
    frontier: "specops-frontier",
} as const;

/** A user-configurable SpecOps role identifier. */
export type AgentId = (typeof AGENT_IDS)[keyof typeof AGENT_IDS];

/** The roles shown by the configuration UI, in stable display order. */
export const ALL_AGENT_IDS = Object.values(AGENT_IDS) as readonly AgentId[];
