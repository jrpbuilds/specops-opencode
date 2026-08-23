import { SPECOPS_LIFECYCLE_PERMISSION } from "../agents/permissions.js";
import type { SpecOpsAgentPermission } from "../agents/definition.js";

export type PermissionEffect = "allow" | "ask" | "deny";

/** OpenCode 2 ordered permission rule. */
export type V2PermissionRule = {
    action: string;
    resource: string;
    effect: PermissionEffect;
};

const ACTION_RENAMES: Readonly<Record<string, string>> = {
    bash: "shell",
    task: "subagent",
};

const V1_ONLY_KEYS = new Set(["doom_loop", "specops_*", SPECOPS_LIFECYCLE_PERMISSION]);

/**
 * Translate the shared SpecOps permission intent into native OpenCode 2 ordered
 * rules. Object insertion order is preserved because V2 uses last-match-wins.
 * V1-only runtime guards are deliberately omitted and enforced by V2 host code.
 */
export function toV2PermissionRules(permission: SpecOpsAgentPermission): V2PermissionRule[] {
    const rules: V2PermissionRule[] = [];

    for (const [key, value] of Object.entries(permission)) {
        if (V1_ONLY_KEYS.has(key)) continue;
        const action = ACTION_RENAMES[key] ?? key;

        if (isEffect(value)) {
            rules.push({ action, resource: "*", effect: value });
            continue;
        }
        if (!value || typeof value !== "object" || Array.isArray(value)) continue;

        for (const [resource, effect] of Object.entries(value)) {
            if (isEffect(effect)) rules.push({ action, resource, effect });
        }
    }

    return rules;
}

/** Append a deny rule last so it wins over broader earlier allows. */
export function denyPrivateSpecOpsSubagents(
    rules: readonly V2PermissionRule[],
): V2PermissionRule[] {
    return [
        ...rules.filter(
            rule => !(rule.action === "subagent" && rule.resource === "specops-*"),
        ),
        { action: "subagent", resource: "specops-*", effect: "deny" },
    ];
}

function isEffect(value: unknown): value is PermissionEffect {
    return value === "allow" || value === "ask" || value === "deny";
}
