import type { Config } from "@opencode-ai/plugin";

/**
 * Custom permission namespace enforced explicitly by each lifecycle tool.
 * OpenCode does not automatically evaluate native permissions for plugin tools,
 * so `requireLifecyclePermission` must request this permission before work.
 */
export const SPECOPS_LIFECYCLE_PERMISSION = "specops_lifecycle";

/** Shared authority for the two SpecOps coordinator entry points. */
export const COORDINATOR_PERMISSION = {
    external_directory: "deny",
    doom_loop: "deny",
    edit: { "*": "deny" },
    bash: { "*": "deny", "openspec --help": "allow", "openspec * --help": "allow" },
    [SPECOPS_LIFECYCLE_PERMISSION]: "allow",
} as const;

/** Read-only repository evidence role. */
export const EXPLORER_PERMISSION = {
    external_directory: "deny",
    doom_loop: "deny",
    edit: { "*": "deny" },
    bash: "deny",
    question: "deny",
    task: { "*": "deny" },
    "specops_*": "deny",
    [SPECOPS_LIFECYCLE_PERMISSION]: "deny",
} as const;

/** OpenSpec planning-artifact authoring role. */
export const PLANNER_PERMISSION = {
    external_directory: "deny",
    doom_loop: "deny",
    // OpenCode matches git projects as openspec/** but worktree="/" projects as
    // home/.../openspec/**; both forms are required for artifact authoring.
    edit: {
        "*": "deny",
        "openspec/**": "allow",
        "**/openspec/**": "allow",
    },
    bash: {
        "*": "deny",
        "openspec instructions *": "allow",
        "openspec validate *": "allow",
    },
    question: "deny",
    task: { "*": "deny" },
    "specops_*": "deny",
    [SPECOPS_LIFECYCLE_PERMISSION]: "deny",
} as const;

/** OpenSpec design-artifact authoring role. */
export const DESIGNER_PERMISSION = {
    external_directory: "deny",
    doom_loop: "deny",
    // Keep design artifacts writable for both git-rooted and worktree="/"
    // projects without broadening the role to repository code.
    edit: {
        "*": "deny",
        "openspec/**": "allow",
        "**/openspec/**": "allow",
    },
    bash: {
        "*": "deny",
        "openspec instructions *": "allow",
        "openspec validate *": "allow",
    },
    question: "deny",
    task: { "*": "deny" },
    "specops_*": "deny",
    [SPECOPS_LIFECYCLE_PERMISSION]: "deny",
} as const;

/** Full implementation authority retained for the issue #3 smoke-test fix. */
export const IMPLEMENTER_PERMISSION = {
    edit: "allow",
    external_directory: "allow",
    doom_loop: "allow",
    bash: "allow",
    question: "deny",
    task: { "*": "deny" },
    "specops_*": "deny",
    [SPECOPS_LIFECYCLE_PERMISSION]: "deny",
} as const;

/** Verification role with native edit denial and deliberate bash authority. */
export const REVIEWER_PERMISSION = {
    external_directory: "allow",
    doom_loop: "allow",
    edit: { "*": "deny" },
    bash: "allow",
    question: "deny",
    task: { "*": "deny" },
    "specops_*": "deny",
    [SPECOPS_LIFECYCLE_PERMISSION]: "deny",
} as const;

/** Advice-only blocker consultation role. */
export const FRONTIER_PERMISSION = {
    external_directory: "deny",
    doom_loop: "deny",
    edit: { "*": "deny" },
    bash: "deny",
    question: "deny",
    task: { "*": "deny" },
    "specops_*": "deny",
    [SPECOPS_LIFECYCLE_PERMISSION]: "deny",
} as const;

/**
 * Ordinary primary agents may run only `specops_doctor` and `specops_onboard`;
 * archive, context, and change-creation lifecycle operations remain denied.
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

/** OpenCode's narrower SDK permission target used for registration casts. */
export type RolePermission = NonNullable<NonNullable<Config["agent"]>[string]>["permission"];

/**
 * Structural description available to code that normalizes permissions before
 * casting them to the SDK type; registration constants use the narrower
 * `RolePermission` cast directly.
 */
export type RolePermissionShape = {
    [key: string]: unknown;
    edit?: "allow" | "ask" | "deny" | Record<string, "allow" | "ask" | "deny">;
    bash?: "allow" | "ask" | "deny" | Record<string, "allow" | "ask" | "deny">;
    task?: Record<string, "allow" | "ask" | "deny">;
    question?: "allow" | "ask" | "deny";
};
