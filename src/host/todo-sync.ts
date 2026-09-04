/**
 * Runtime publication of the SpecOps Todo projection.
 *
 * OpenCode exposes no plugin write API for Todo state (verified through the
 * 1.18.x line): the only writer is the builtin `todowrite` tool executed
 * inside a model turn. Synchronization is therefore deliberately
 * trigger-driven — the supported v1.7 contract. The coordinator's only Todo
 * interaction is a blind refresh trigger: it invokes `todowrite` with an
 * empty payload at the moments the contract names, and this hook intercepts
 * that one tool through `tool.execute.before` and replaces the payload in
 * place with the canonical projection rebuilt from fresh durable OpenSpec
 * state. The coordinator never authors, reconciles, reads, or persists Todo
 * content; every trigger is a full rebuild, so extra triggers are harmless
 * and no stale entries survive a planning revision or a resume. Ephemeral
 * parallel implementation/review entries are deferred to the runtime event
 * wiring (#53).
 *
 * The hook is session-scoped and fails open by construction: sessions without
 * a recorded SpecOps binding pass through untouched, every failure (durable
 * read, projection, unexpected shape) degrades to the model-authored list,
 * and nothing is ever thrown — a hook failure must never break the model's
 * tool call. Todo state is never read back as workflow authority.
 *
 * Lifecycle advancement consumes the same canonical phase derivation the
 * status surface answers from: every publication reads the change's apply
 * context beside its status, and the post-plan stages advance with the
 * derived phase — implementation once the entry gate is observed or a task
 * checkbox lands, review once every task is done. Observing the
 * permission-gated `specops_apply_instructions` call marks the session's
 * implementation-entry gate, so the projection shows implementation as
 * current work immediately at the approval transition rather than waiting
 * for the first durable checkbox.
 *
 * Verified against OpenCode's runtime: `plugin.trigger` passes the hook the
 * same `{ args }` object the tool then executes, so mutating `output.args`
 * in place is the required mutation contract; reassigning `output.args`
 * would not reach the builtin tool. The minimal trigger therefore always
 * sends a `todos` payload (`{"todos": []}`) so the builtin's schema accepts
 * it even when publication degrades.
 *
 * Exports: `TodoSyncDeps`, `createTodoSyncHook`.
 */
import type { Hooks } from "@opencode-ai/plugin";
import { buildNativeTodoProjection } from "../coordinator/todo-publication.js";
import type { ApplyInstructionsResult } from "../openspec/apply-instructions.js";
import type { OpenSpecStatusResult } from "../openspec/status.js";
import {
    getSessionBinding,
    hasEnteredImplementation,
    markImplementationEntered,
} from "./session-bindings.js";

/** Dependency boundary keeping the hook testable without a live OpenSpec CLI. */
export type TodoSyncDeps = {
    /** Project directory the durable status read targets. */
    directory: string;
    getOpenSpecStatus: (change: string, cwd: string) => Promise<OpenSpecStatusResult>;
    getApplyInstructions: (change: string, cwd: string) => Promise<ApplyInstructionsResult>;
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
        if (input.tool !== "todowrite") {
            if (input.tool === "specops_apply_instructions") {
                markImplementationEntered(input.sessionID);
            }
            return;
        }
        const binding = getSessionBinding(input.sessionID);
        if (!binding) return;
        try {
            const result = await deps.getOpenSpecStatus(binding.change, deps.directory);
            if (!result.ok) return;
            if (!output.args || typeof output.args !== "object" || Array.isArray(output.args)) {
                return;
            }
            const apply = await deps.getApplyInstructions(binding.change, deps.directory);
            output.args.todos = buildNativeTodoProjection(result.status, binding.mode, {
                apply: apply.ok ? apply.context : undefined,
                implementationEntered: hasEnteredImplementation(input.sessionID),
            });
        } catch {
            // Fail open: publication must never break the model's todowrite call.
        }
    };
}
