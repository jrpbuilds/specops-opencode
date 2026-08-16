import type { ToolContext } from "@opencode-ai/plugin/tool";
import { SPECOPS_LIFECYCLE_PERMISSION } from "../agents/permissions.js";

/**
 * Require the current agent's permission before a lifecycle tool performs work.
 *
 * Custom plugin tools are not automatically checked by OpenCode's permission
 * evaluator, so each tool must make this request explicitly. `toolId` must
 * exactly match the registered tool name because it is used both as the
 * permission pattern and the allowlist entry. Callers must invoke this before
 * producing metadata or performing any other side effect.
 *
 * @param context Tool context used to request the current agent's permission.
 * @param toolId Exact registered lifecycle tool name.
 */
export async function requireLifecyclePermission(
    context: Pick<ToolContext, "ask">,
    toolId: string,
): Promise<void> {
    await context.ask({
        permission: SPECOPS_LIFECYCLE_PERMISSION,
        patterns: [toolId],
        always: [toolId],
        metadata: { tool: toolId },
    });
}
