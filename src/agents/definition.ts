/**
 * Host-neutral description of one registrable SpecOps agent role.
 *
 * Agent modules build these definitions from persisted configuration and
 * packaged prompts without importing any OpenCode API. The OpenCode 1 adapter
 * (`src/host/agents.ts`) is the only place that translates a definition into
 * a host registration entry, including permission-shape casting.
 */
export type SpecOpsAgentMode = "primary" | "subagent";

/**
 * Structural description of one role's permission record: canonical policy
 * values plus invariant keys such as `question` and `task`. Map structure and
 * match-ordering semantics belong to the host adapter's translation; the SDK's
 * narrower permission type lives with it in `src/host/permissions.ts`.
 */
export type SpecOpsAgentPermission = {
    [key: string]: unknown;
    edit?: "allow" | "ask" | "deny" | Record<string, "allow" | "ask" | "deny">;
    bash?: "allow" | "ask" | "deny" | Record<string, "allow" | "ask" | "deny">;
    task?: Record<string, "allow" | "ask" | "deny">;
    question?: "allow" | "ask" | "deny";
};

export type SpecOpsAgentDefinition = {
    /** Registration key presented to the host for this role. */
    id: string;
    description: string;
    mode: SpecOpsAgentMode;
    hidden?: boolean;
    prompt: string;
    permission: SpecOpsAgentPermission;
    model?: string;
    variant?: string;
};
