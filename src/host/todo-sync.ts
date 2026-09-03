/**
 * Runtime publication of the SpecOps Todo projection.
 *
 * OpenCode stores native Todo state per session and exposes no plugin write
 * API — the only writer is the builtin `todowrite` tool the model invokes.
 * This hook therefore intercepts that one tool through `tool.execute.before`
 * and replaces the model-supplied payload with the canonical projection built
 * from fresh durable OpenSpec state, so Todo content is runtime-owned while
 * the model's call remains only a flush trigger. Fully automatic
 * synchronization is #52's scope.
 *
 * The hook is session-scoped and fails open by construction: sessions without
 * a recorded SpecOps binding pass through untouched, every failure (durable
 * read, projection, unexpected shape) degrades to the model-authored list,
 * and nothing is ever thrown — a hook failure must never break the model's
 * tool call. Todo state is never read back as workflow authority.
 *
 * Verified against OpenCode's runtime: `plugin.trigger` passes the hook the
 * same `{ args }` object the tool then executes, so mutating `output.args`
 * in place is the required mutation contract; reassigning `output.args`
 * would not reach the builtin tool.
 *
 * Exports: `TodoSyncDeps`, `createTodoSyncHook`.
 */
import type { Hooks } from "@opencode-ai/plugin";
import { buildNativeTodoProjection } from "../coordinator/todo-publication.js";
import type { OpenSpecStatusResult } from "../openspec/status.js";
import { getSessionBinding } from "./session-bindings.js";

/** Dependency boundary keeping the hook testable without a live OpenSpec CLI. */
export type TodoSyncDeps = {
    /** Project directory the durable status read targets. */
    directory: string;
    getOpenSpecStatus: (change: string, cwd: string) => Promise<OpenSpecStatusResult>;
};

/**
 * Build the `tool.execute.before` hook that publishes the canonical Todo
 * projection.
 *
 * @param deps The project directory and durable status reader used for every
 * publication.
 * @returns A hook that never throws and passes through anything it cannot
 * publish.
 */
export function createTodoSyncHook(deps: TodoSyncDeps): NonNullable<Hooks["tool.execute.before"]> {
    return async (input, output) => {
        if (input.tool !== "todowrite") return;
        const binding = getSessionBinding(input.sessionID);
        if (!binding) return;
        try {
            const result = await deps.getOpenSpecStatus(binding.change, deps.directory);
            if (!result.ok) return;
            if (!output.args || typeof output.args !== "object" || Array.isArray(output.args)) {
                return;
            }
            output.args.todos = buildNativeTodoProjection(result.status, binding.mode);
        } catch {
            // Fail open: publication must never break the model's todowrite call.
        }
    };
}
