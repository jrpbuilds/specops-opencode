import { ROLE_CAPABILITY_POLICY } from "./permission-policy.js";

/**
 * Custom permission namespace enforced explicitly by each lifecycle tool.
 * OpenCode does not automatically evaluate native permissions for plugin tools,
 * so `requireLifecyclePermission` must request this permission before work.
 */
export const SPECOPS_LIFECYCLE_PERMISSION = "specops_lifecycle";

/**
 * Architectural invariant overlay applied to every specialist role.
 *
 * The runtime loop guard is pinned to allow: specialists serve both the
 * interactive and auto coordinators through one static registration, so a
 * pinned deny would silently abort spurious loop detection mid-phase, and an
 * ask would stall headless runs. Allow matches the shipped implementer and
 * reviewer precedent; each role's edit/bash scope bounds any loop's blast
 * radius instead.
 */
const SPECIALIST_INVARIANT = {
    question: "deny",
    doom_loop: "allow",
    task: { "*": "deny" },
    "specops_*": "deny",
    [SPECOPS_LIFECYCLE_PERMISSION]: "deny",
} as const;

/** Coordinator lifecycle ownership — task and question are added at registration. */
const COORDINATOR_LIFECYCLE_INVARIANT = {
    [SPECOPS_LIFECYCLE_PERMISSION]: "allow",
} as const;

/** Shared authority for the two SpecOps coordinator entry points. */
export const COORDINATOR_PERMISSION = {
    ...ROLE_CAPABILITY_POLICY["specops-coordinator"],
    ...COORDINATOR_LIFECYCLE_INVARIANT,
} as const;

/** Read-only repository evidence role. */
export const EXPLORER_PERMISSION = {
    ...ROLE_CAPABILITY_POLICY["specops-explorer"],
    ...SPECIALIST_INVARIANT,
} as const;

/** OpenSpec planning-artifact authoring role. */
export const PLANNER_PERMISSION = {
    ...ROLE_CAPABILITY_POLICY["specops-planner"],
    ...SPECIALIST_INVARIANT,
} as const;

/** OpenSpec design-artifact authoring role. */
export const DESIGNER_PERMISSION = {
    ...ROLE_CAPABILITY_POLICY["specops-designer"],
    ...SPECIALIST_INVARIANT,
} as const;

/** Implementation capabilities are declared in permission-policy.ts. */
export const IMPLEMENTER_PERMISSION = {
    ...ROLE_CAPABILITY_POLICY["specops-implementer"],
    ...SPECIALIST_INVARIANT,
} as const;

/** Verification role with native edit denial and deliberate bash authority. */
export const REVIEWER_PERMISSION = {
    ...ROLE_CAPABILITY_POLICY["specops-reviewer"],
    ...SPECIALIST_INVARIANT,
} as const;

/** Advice-only blocker consultation role. */
export const FRONTIER_PERMISSION = {
    ...ROLE_CAPABILITY_POLICY["specops-frontier"],
    ...SPECIALIST_INVARIANT,
} as const;

/**
 * Ordinary primary agents may run only `specops_doctor` and `specops_onboard`;
 * archive, context, status, validate-change, and config lifecycle operations
 * remain denied.
 *
 * `specops_config` is intentionally NOT allowlisted here. It is a
 * coordinator-only surface, and ordinary agents are denied through the
 * `"*": "deny"` fallback. Add it here only if ordinary agents should ever gain
 * read access to the effective SpecOps configuration (not currently desired).
 */
export const ORDINARY_LIFECYCLE_PERMISSION = {
    "*": "deny",
    specops_doctor: "allow",
    specops_onboard: "allow",
} as const;

/**
 * Agent-name glob identifying the private SpecOps subagent namespace.
 *
 * OpenCode's `task` permission matches its `pattern` against the subagent
 * name, so `specops-*` covers internal subagents and future roles in that
 * reserved namespace. The visible `SpecOps` coordinator keys are handled
 * separately by `isSpecOpsAgentKey`.
 */
export const SPECOPS_TASK_GLOB = "specops-*";

/**
 * Permission shapes for the private subagent boundary.
 *
 * `applyTaskBoundary` applies an equivalent `specops-*` deny at the global and
 * per-agent levels through `denyTaskGlob`, preserving existing task rules while
 * placing the deny last. Coordinators use `SPECOPS_TASK_ALLOW`, which denies
 * every other subagent and allows the private namespace last so OpenCode's
 * last-match-wins evaluation selects it.
 */
export const SPECOPS_TASK_DENY = { [SPECOPS_TASK_GLOB]: "deny" } as const;

/** Coordinators may dispatch only the private specops-* subagent namespace. */
export const SPECOPS_TASK_ALLOW = {
    "*": "deny",
    [SPECOPS_TASK_GLOB]: "allow",
} as const;

/**
 * Merge a deny glob into a `task` permission value, safely normalizing the
 * scalar, map, and undefined shapes OpenCode accepts.
 *
 * OpenCode's `fromConfig` turns a scalar string into a single `"*"` rule and a
 * map into one rule per key (insertion order preserved). Because permission
 * evaluation uses the last matching rule, the deny glob is always emitted last
 * so it wins over any `"*"` allow that precedes it.
 *
 * - scalar `"allow"` -> `{ "*": "allow", <glob>: "deny" }`
 * - scalar `"ask"`   -> `{ "*": "ask",   <glob>: "deny" }`
 * - scalar `"deny"`  -> `{ "*": "deny",  <glob>: "deny" }`
 * - map              -> `{ ...map (minus <glob>), <glob>: "deny" }`
 * - undefined        -> `{ <glob>: "deny" }`
 */
export function denyTaskGlob(
    task: unknown,
    glob: string,
): Record<string, "allow" | "ask" | "deny"> {
    if (task == null) return { [glob]: "deny" };
    if (typeof task === "string") {
        return { "*": task as "allow" | "ask" | "deny", [glob]: "deny" };
    }
    if (typeof task === "object" && !Array.isArray(task)) {
        const entries = Object.entries(task).filter(([key]) => key !== glob);
        return { ...Object.fromEntries(entries), [glob]: "deny" };
    }
    return { [glob]: "deny" };
}
