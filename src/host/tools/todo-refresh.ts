/**
 * Compact Todo refresh directive appended to lifecycle tool outputs.
 *
 * OpenCode exposes no plugin write API for Todo state, so publication rides
 * the coordinator's builtin `todowrite` call (see `../todo-sync.ts`). Cheap
 * coordinators demonstrably skip a blind `{"todos": []}` call instructed only
 * by prose, so lifecycle tools and specialist dispatch results end their
 * result with this stable, compact marker. The coordinator prompt defines the
 * marker's meaning: after consuming a batch of results, it requires one
 * immediate `todowrite` call with `{"todos": []}` when one or more markers
 * appeared, and nothing else; the runtime continues to own and replace all
 * Todo content. Extra triggers are harmless, so the marker is emitted
 * unconditionally — including on failure outputs — without state diffing.
 *
 * The marker must stay a directive, not prose: it is matched by shape in the
 * coordinator contract and must never grow explanatory text.
 *
 * Exports: `SPECOPS_TODO_REFRESH`, `withTodoRefreshReminder`,
 * `createTaskResultRefreshHook`.
 */
import type { Hooks } from "@opencode-ai/plugin";
import { claimTodoRefreshForMessage, getSessionBinding } from "../session-bindings.js";

/** The stable, compact refresh directive appended at Todo refresh moments. */
export const SPECOPS_TODO_REFRESH =
    'SPECOPS_TODO_REFRESH: call todowrite with {"todos":[]} now — one refresh per assistant turn.';

/** Scope used to coalesce lifecycle refresh markers within one assistant turn. */
export type TodoRefreshContext = {
    sessionID: string;
    messageID: string;
};

/**
 * Append the compact refresh directive to one lifecycle tool output.
 *
 * Idempotent by construction: an output that already carries the marker is
 * returned unchanged, so decoration can never cascade into a refresh loop.
 *
 * @param output The raw lifecycle tool output.
 * @param context Optional coordinator message scope used for coalescing.
 * @returns The output terminated by the compact refresh directive.
 */
export function withTodoRefreshReminder(output: string, context?: TodoRefreshContext): string {
    if (
        context &&
        getSessionBinding(context.sessionID) &&
        !claimTodoRefreshForMessage(context.sessionID, context.messageID)
    ) {
        return output;
    }
    if (output.includes(SPECOPS_TODO_REFRESH)) return output;
    return `${output}\n\n${SPECOPS_TODO_REFRESH}`;
}

/**
 * Build the after-hook that cues a bound coordinator after every specialist
 * dispatch, including foreground, background, successful, and failed results.
 *
 * The generic OpenCode after-hook does not expose the assistant message id, so
 * task results are intentionally decorated individually. The coordinator
 * contract coalesces multiple task markers received in one assistant turn.
 */
export function createTaskResultRefreshHook(): NonNullable<Hooks["tool.execute.after"]> {
    return async (input, output) => {
        if (input.tool !== "task" || !getSessionBinding(input.sessionID)) return;
        try {
            if (typeof output?.output !== "string") return;
            output.output = withTodoRefreshReminder(output.output);
        } catch {
            // Fail open: a refresh cue must never break a specialist result.
        }
    };
}
