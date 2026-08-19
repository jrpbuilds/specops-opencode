import type { AgentId } from "./ids.js";

/**
 * Declarative, edit-friendly role capability policy. Capabilities only — the
 * architectural invariant fields (question, task, specops_*, specops_lifecycle)
 * are intentionally absent and applied in code by `permissions.ts` so they
 * cannot drift or be silently weakened.
 *
 * Within each `edit`/`bash` map, rules are evaluated by OpenCode using
 * last-match-wins semantics, so insertion order is significant: `"*"` deny is
 * emitted first and specific allows follow.
 */
export const ROLE_CAPABILITY_POLICY = {
    "specops-coordinator": {
        external_directory: "deny",
        doom_loop: "deny",
        edit: { "*": "deny" },
        // Read-only OpenSpec inspection: instructions fetches template text for
        // subagents, `change show` renders deltas/JSON for orchestration. Neither
        // mutates openspec state, so the coordinator cannot drift specs through bash.
        bash: {
            "*": "deny",
            "openspec --help": "allow",
            "openspec * --help": "allow",
            "openspec instructions *": "allow",
            "openspec change show *": "allow",
        },
    },
    "specops-explorer": {
        external_directory: "deny",
        doom_loop: "deny",
        edit: { "*": "deny" },
        bash: "deny",
    },
    "specops-planner": {
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
    },
    "specops-designer": {
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
    },
    "specops-implementer": {
        edit: "allow",
        external_directory: "deny",
        doom_loop: "allow",
        bash: "allow",
    },
    "specops-reviewer": {
        external_directory: "deny",
        doom_loop: "allow",
        edit: { "*": "deny" },
        bash: "allow",
    },
    "specops-frontier": {
        external_directory: "deny",
        doom_loop: "deny",
        edit: { "*": "deny" },
        bash: "deny",
    },
} as const satisfies Record<AgentId, RoleCapabilityShape>;

export type RoleCapabilityShape = {
    external_directory: "allow" | "deny";
    doom_loop: "allow" | "deny";
    edit: "allow" | "deny" | Record<string, "allow" | "ask" | "deny">;
    bash: "allow" | "deny" | Record<string, "allow" | "ask" | "deny">;
};
