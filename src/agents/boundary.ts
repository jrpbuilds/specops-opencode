import type { Config } from "@opencode-ai/plugin";
import { SPECOPS_AGENT_ID, SPECOPS_AUTO_AGENT_ID } from "./coordinator.js";
import {
    ORDINARY_LIFECYCLE_PERMISSION,
    SPECOPS_LIFECYCLE_PERMISSION,
    SPECOPS_TASK_GLOB,
    denyTaskGlob,
} from "./permissions.js";

/**
 * Whether an agent key belongs to the SpecOps workflow itself (a coordinator or
 * an internal `specops-*` subagent).
 *
 * These agents must be excluded from the per-agent deny pass because they
 * carry their own explicit `task` rules: the coordinators allow `specops-*`,
 * and the internal subagents deny `*`.
 */
export function isSpecOpsAgentKey(key: string): boolean {
    return key === SPECOPS_AGENT_ID || key === SPECOPS_AUTO_AGENT_ID || key.startsWith("specops-");
}

/**
 * Apply the private `specops-*` boundary to the host configuration.
 *
 * Two deny layers enforce the invariant that only the SpecOps coordinators may
 * dispatch `specops-*` subagents:
 *
 * 1. A global `permission.task["specops-*"] = "deny"` covers OpenCode's native
 *    primary agents (`build`, `plan`, `general`, `explore`), whose hardcoded
 *    rules are merged before the global/user ruleset.
 * 2. A per-agent `permission.task["specops-*"] = "deny"` covers custom and
 *    third-party agents (and user-overridden native agents), whose own
 *    permission is merged after the global ruleset and would otherwise
 *    override a global-only deny.
 *
 * Both merges preserve unrelated permission keys and any scalar or map-shaped
 * `task` value through {@link denyTaskGlob}, which always places the deny last
 * so OpenCode's last-match-wins evaluation favours it.
 *
 * @param config OpenCode configuration object mutated in place.
 */
export function applyTaskBoundary(config: Config): void {
    if (typeof config.permission === "string") {
        config.permission = { "*": config.permission } as Config["permission"];
    }
    const globalPermission = config.permission as Record<string, unknown> | undefined;
    config.permission = {
        ...(globalPermission ?? {}),
        task: denyTaskGlob(globalPermission?.task, SPECOPS_TASK_GLOB),
    } as Config["permission"];

    for (const [name, agent] of Object.entries(config.agent ?? {})) {
        if (isSpecOpsAgentKey(name)) continue;
        const agentPermission = agent?.permission;
        const agentTask =
            agentPermission &&
            typeof agentPermission === "object" &&
            !Array.isArray(agentPermission)
                ? (agentPermission as Record<string, unknown>).task
                : undefined;
        (agent as { permission?: Record<string, unknown> }).permission = {
            ...(agentPermission && typeof agentPermission === "object"
                ? (agentPermission as Record<string, unknown>)
                : {}),
            task: denyTaskGlob(agentTask, SPECOPS_TASK_GLOB),
        };
    }
}

/**
 * Restrict lifecycle tools for ordinary primary agents while leaving the
 * user-facing doctor and onboarding operations available. SpecOps role
 * registrations are added after this hook and provide their own explicit
 * lifecycle authority.
 */
export function applyLifecycleBoundary(config: Config): void {
    if (typeof config.permission === "string") {
        config.permission = { "*": config.permission } as Config["permission"];
    }

    const globalPermission = config.permission as Record<string, unknown> | undefined;
    config.permission = {
        ...(globalPermission ?? {}),
        [SPECOPS_LIFECYCLE_PERMISSION]: ORDINARY_LIFECYCLE_PERMISSION,
    } as Config["permission"];

    for (const [name, agent] of Object.entries(config.agent ?? {})) {
        if (isSpecOpsAgentKey(name) || agent?.mode === "subagent") continue;
        const agentPermission = agent?.permission;
        (agent as { permission?: Record<string, unknown> }).permission = {
            ...(agentPermission && typeof agentPermission === "object"
                ? (agentPermission as Record<string, unknown>)
                : {}),
            [SPECOPS_LIFECYCLE_PERMISSION]: ORDINARY_LIFECYCLE_PERMISSION,
        };
    }
}
