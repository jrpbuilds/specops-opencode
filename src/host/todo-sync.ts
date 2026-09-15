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
 * parallel implementation/review entries are derived from the runtime's own
 * dispatch observation (`./parallel-progress.ts`), not coordinator state.
 *
 * The hook is session-scoped and fails open by construction: sessions without
 * a recorded SpecOps binding pass through untouched, every failure (durable
 * read, projection, unexpected shape) falls back to the last successful
 * projection when available, and otherwise preserves the model-authored list.
 * Nothing is ever thrown — a hook failure must never break the model's tool
 * call. Todo state is never read back as workflow authority.
 *
 * Lifecycle advancement consumes the same canonical phase derivation the
 * status surface answers from: every publication reads the change's apply
 * context beside its status, and the post-plan stages advance with the
 * derived phase — implementation once the entry gate is observed or a task
 * checkbox lands, review once every task is done. Observing the
 * permission-gated `specops_apply_instructions` call marks the session's
 * implementation-entry gate (`./review-cycle.ts`), so the projection shows
 * implementation as current work immediately at the approval transition
 * rather than waiting for the first durable checkbox.
 *
 * Review outcomes are not durable OpenSpec state, so post-review stages are
 * advanced from the runtime's own observations: the observer records the
 * reviewer's verdict and remediation rounds, and each publication feeds that
 * snapshot to the projection, which hands current work to the remediation,
 * re-review, or terminal archive-or-remediate stages as the cycle moves.
 * A successful archive is also observed — the change no longer exists, so
 * the next publication's durable read fails and the hook instead republishes
 * the terminal, all-complete projection finalized at archive time; without a
 * remembered projection the hook degrades as usual. A publication that was
 * still reading and building when the archive moved the change serves that
 * finalized list too, so a stale rebuild can never publish over or
 * re-remember the terminal state. All of this is
 * presentation state: it never persists, never survives a restart, and never
 * feeds workflow routing.
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
import type { ParallelProgressInput } from "../coordinator/todo-projection.js";
import { summarizeReviewFanout } from "../coordinator/review-fanout.js";
import type { ApplyInstructionsResult } from "../openspec/apply-instructions.js";
import type { OpenSpecStatusResult } from "../openspec/status.js";
import { snapshotParallelProgress } from "./parallel-progress.js";
import { observeImplementationGate } from "./review-cycle.js";
import {
    clearArchivedChange,
    getRememberedTodoProjection,
    getReviewCycle,
    getSessionBinding,
    hasArchivedChange,
    hasEnteredImplementation,
    rememberTodoProjection,
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
                observeImplementationGate(input.sessionID);
            }
            return;
        }
        const binding = getSessionBinding(input.sessionID);
        if (!binding) return;
        if (!output?.args || typeof output.args !== "object" || Array.isArray(output.args)) {
            return;
        }
        try {
            const result = await deps.getOpenSpecStatus(binding.change, deps.directory);
            if (!result.ok) {
                restoreRememberedProjection(input.sessionID, output);
                return;
            }
            // A live durable read after an observed archive means the change
            // is active again under the same name: the next successful
            // publication supersedes the finalized terminal list.
            if (hasArchivedChange(input.sessionID)) clearArchivedChange(input.sessionID);
            const apply = await deps.getApplyInstructions(binding.change, deps.directory);
            // A failed read is an environmental failure, not an empty task
            // state: rebuilding would project every lifecycle stage as
            // pending — regressing an advanced list back to the approval
            // checkpoint — and would remember that regression. Keep the last
            // good projection instead; with none, pass the model payload
            // through, exactly like a failed status read.
            if (!apply.ok) {
                restoreRememberedProjection(input.sessionID, output);
                return;
            }
            // Ephemeral parallel entries come from the runtime's own dispatch
            // observation, never from coordinator bookkeeping. Failed critics
            // and failed dispatches surface through coordinator reporting, not
            // Todo state, so only live or completed work is projected.
            const snapshot = snapshotParallelProgress(input.sessionID);
            const fanout = snapshot.reviewFanout
                ? summarizeReviewFanout(snapshot.reviewFanout)
                : undefined;
            const dispatches = (snapshot.implementerDispatches ?? []).flatMap(dispatch =>
                dispatch.state === "failed"
                    ? []
                    : [
                          dispatch.dispatchId === undefined
                              ? { state: dispatch.state }
                              : { dispatchId: dispatch.dispatchId, state: dispatch.state },
                      ],
            );
            const parallel: ParallelProgressInput | undefined =
                fanout?.ok || dispatches.length > 0
                    ? {
                          reviewFanout: fanout?.ok ? fanout.progress : undefined,
                          implementerDispatches: dispatches,
                      }
                    : undefined;
            const todos = buildNativeTodoProjection(
                result.status,
                binding.mode,
                {
                    apply: apply.context,
                    implementationEntered: hasEnteredImplementation(input.sessionID),
                    reviewCycle: getReviewCycle(input.sessionID),
                },
                parallel,
            );
            // The archive landed while this publication was reading and
            // building: the fresh rebuild is stale, so serve the finalized
            // terminal list and never remember the rebuild over it.
            if (hasArchivedChange(input.sessionID)) {
                restoreRememberedProjection(input.sessionID, output);
                return;
            }
            output.args.todos = todos;
            rememberTodoProjection(input.sessionID, todos);
        } catch {
            // Fail open: a stale projection is safer than an empty panel, but
            // publication must never break the model's todowrite call.
            restoreRememberedProjection(input.sessionID, output);
        }
    };
}

/** Restore the most recent good projection without inventing workflow state. */
function restoreRememberedProjection(
    sessionID: string,
    output: { args: Record<string, unknown> },
): void {
    const todos = getRememberedTodoProjection(sessionID);
    if (todos) output.args.todos = todos;
}
