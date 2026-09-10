/**
 * Display suppression for the SpecOps Todo projection.
 *
 * Every refresh trigger invokes the builtin `todowrite` tool, and OpenCode's
 * transcript renders each of those tool-call parts as a `# Todos` block. The
 * renderer gates that block on the part's `metadata.todos` array: non-empty
 * arrays render the full block, while empty arrays collapse the part into
 * OpenCode's built-in compact `~ Updating todos…` row. This hook empties that
 * display metadata after execution for SpecOps-bound sessions, so each trigger
 * renders only that compact row instead of a full block. The persisted session
 * Todo state — the sidebar's source — was already written from the swapped
 * payload during execution, so publication is unaffected.
 *
 * The hook is session-scoped and fails open by construction: sessions without
 * a recorded SpecOps binding pass through untouched, malformed metadata
 * shapes are skipped, and nothing is ever thrown — a hook failure must never
 * break the model's tool call.
 *
 * Exports: `createTodoDisplayHook`.
 */
import type { Hooks } from "@opencode-ai/plugin";
import { getSessionBinding } from "./session-bindings.js";

/**
 * Build the `tool.execute.after` hook that empties the `todowrite` display
 * metadata for SpecOps-bound sessions.
 *
 * @returns A hook that never throws and passes through anything it cannot
 * suppress.
 */
export function createTodoDisplayHook(): NonNullable<Hooks["tool.execute.after"]> {
    return async (input, output) => {
        if (input.tool !== "todowrite") return;
        if (!getSessionBinding(input.sessionID)) return;
        try {
            if (
                output.metadata &&
                typeof output.metadata === "object" &&
                !Array.isArray(output.metadata)
            ) {
                output.metadata.todos = [];
            }
        } catch {
            // Fail open: suppression must never break the model's todowrite call.
        }
    };
}
