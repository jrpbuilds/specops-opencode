import { AGENT_IDS, type AgentId } from "./ids.js";

/**
 * Genuinely shared scalar metadata for one configurable SpecOps role.
 *
 * `inheritsModelFrom` is present only on the three review specialists, whose
 * effective model falls back to the reviewer's mapping when unset.
 */
export type RoleMeta = {
    displayName: string;
    promptFile: string;
    inheritsModelFrom?: AgentId;
};

/**
 * Canonical single source for role display names, prompt files, and
 * reviewer→specialist model inheritance.
 *
 * `as const satisfies Record<AgentId, RoleMeta>` makes a missing or extra role
 * a compile-time error and preserves literal types for the shared scalars.
 */
export const ROLE_META = {
    [AGENT_IDS.coordinator]: { displayName: "Coordinator", promptFile: "coordinator.md" },
    [AGENT_IDS.explorer]: { displayName: "Explorer", promptFile: "explorer.md" },
    [AGENT_IDS.planner]: { displayName: "Planner", promptFile: "planner.md" },
    [AGENT_IDS.designer]: { displayName: "Designer", promptFile: "designer.md" },
    [AGENT_IDS.implementer]: { displayName: "Implementer", promptFile: "implementer.md" },
    [AGENT_IDS.reviewer]: { displayName: "Reviewer", promptFile: "reviewer.md" },
    [AGENT_IDS.reviewCorrectness]: {
        displayName: "Review - Correctness",
        promptFile: "review-correctness.md",
        inheritsModelFrom: AGENT_IDS.reviewer,
    },
    [AGENT_IDS.reviewRisk]: {
        displayName: "Review - Risk",
        promptFile: "review-risk.md",
        inheritsModelFrom: AGENT_IDS.reviewer,
    },
    [AGENT_IDS.reviewQuality]: {
        displayName: "Review - Quality",
        promptFile: "review-quality.md",
        inheritsModelFrom: AGENT_IDS.reviewer,
    },
    [AGENT_IDS.frontier]: { displayName: "Frontier", promptFile: "frontier.md" },
} as const satisfies Record<AgentId, RoleMeta>;
