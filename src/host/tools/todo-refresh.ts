/**
 * Compact Todo refresh directive appended to lifecycle tool outputs.
 *
 * OpenCode exposes no plugin write API for Todo state, so publication rides
 * the coordinator's builtin `todowrite` call (see `../todo-sync.ts`). Cheap
 * coordinators demonstrably skip a blind `{"todos": []}` call instructed only
 * by prose, so the seven lifecycle tools whose outputs the coordinator reads
 * at the contract's refresh moments end their result with this stable, compact
 * marker. The coordinator prompt defines the marker's meaning: it requires
 * one immediate `todowrite` call with `{"todos": []}` per marker occurrence
 * and nothing else; the runtime continues to own and replace all Todo
 * content, and extra triggers are harmless, so the marker is emitted
 * unconditionally — including on failure outputs — without any state diffing.
 *
 * The marker must stay a directive, not prose: it is matched by shape in the
 * coordinator contract and must never grow explanatory text.
 *
 * Exports: `SPECOPS_TODO_REFRESH`, `withTodoRefreshReminder`.
 */

/** The stable, compact refresh directive appended at Todo refresh moments. */
export const SPECOPS_TODO_REFRESH =
    'SPECOPS_TODO_REFRESH: call todowrite with {"todos":[]} now — one call per marker.';

/**
 * Append the compact refresh directive to one lifecycle tool output.
 *
 * Idempotent by construction: an output that already carries the marker is
 * returned unchanged, so decoration can never cascade into a refresh loop.
 *
 * @param output The raw lifecycle tool output.
 * @returns The output terminated by the compact refresh directive.
 */
export function withTodoRefreshReminder(output: string): string {
    if (output.includes(SPECOPS_TODO_REFRESH)) return output;
    return `${output}\n\n${SPECOPS_TODO_REFRESH}`;
}
