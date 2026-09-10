/**
 * Process-scoped bindings from OpenCode session ids to the active SpecOps
 * change, captured by the change-carrying lifecycle tools.
 *
 * The Todo publication hook (`src/host/todo-sync.ts`) consumes a binding to
 * know which change's projection a session's `todowrite` calls should carry.
 * Bindings are ephemeral host state — they never persist, never feed workflow
 * routing, and a missing binding simply leaves a session's Todo writes
 * untouched. Only SpecOps coordinator agents are recorded, so ordinary
 * sessions and specialist subagents are never intercepted.
 *
 * The module also tracks ephemeral per-session Todo publication state: whether
 * a refresh marker was emitted for the current assistant message, and the last
 * successful projection used when a later durable read fails. Like bindings,
 * this state never persists and never feeds workflow routing.
 *
 * Two further observation sets support the projection's post-plan stages: the
 * review cycle (the latest observed reviewer verdict and its remediation
 * round, recorded by `src/host/review-cycle.ts`) and an observed successful
 * archive, whose remembered projection is finalized into its terminal, all-
 * complete form at observation time — after an archive the active change no
 * longer exists, so a durable rebuild is impossible. All of it is presentation
 * state, cleared when a session switches change or mode, and never feeds
 * workflow routing.
 *
 * Exports: `SessionBinding`, `recordSessionBinding`, `getSessionBinding`,
 * `claimTodoRefreshForMessage`, `rememberTodoProjection`,
 * `getRememberedTodoProjection`, `markImplementationEntered`,
 * `hasEnteredImplementation`, `recordReviewCycle`, `getReviewCycle`,
 * `clearReviewCycle`, `recordArchivedChange`, `__resetSessionBindingsForTesting`.
 */
import { SPECOPS_AGENT_ID, SPECOPS_AUTO_AGENT_ID } from "../agents/coordinator.js";
import type { ReviewCycleObservation, TodoProjectionMode } from "../coordinator/todo-projection.js";
import type { NativeTodoItem } from "../coordinator/todo-publication.js";

/** One session's active SpecOps change and coordinator mode. */
export type SessionBinding = {
    change: string;
    mode: TodoProjectionMode;
};

const bindings = new Map<string, SessionBinding>();

/** Last assistant message that emitted a refresh marker for each session. */
const lastTodoRefreshMessage = new Map<string, string>();

/** Last successful runtime-owned projection for each bound session. */
const rememberedTodoProjections = new Map<string, NativeTodoItem[]>();

/** Sessions observed crossing the implementation-entry gate. */
const implementationEntered = new Set<string>();

/** Per-session observed review-cycle state, recorded by the review-cycle observer. */
const reviewCycles = new Map<string, ReviewCycleObservation>();

/**
 * Record or refresh the binding for one session.
 *
 * The latest lifecycle call wins, so a session that switches changes follows
 * the new one. Non-SpecOps agents, empty session ids, and empty change names
 * are ignored.
 *
 * @param sessionID OpenCode session identifier from the tool context.
 * @param agent Agent name from the tool context.
 * @param change Active change name supplied to the lifecycle tool.
 */
export function recordSessionBinding(sessionID: string, agent: string, change: string): void {
    const trimmed = change.trim();
    if (!sessionID || !trimmed) return;
    const mode =
        agent === SPECOPS_AUTO_AGENT_ID
            ? "auto"
            : agent === SPECOPS_AGENT_ID
              ? "interactive"
              : undefined;
    if (!mode) return;

    const previous = bindings.get(sessionID);
    if (previous?.change !== trimmed || previous.mode !== mode) {
        lastTodoRefreshMessage.delete(sessionID);
        rememberedTodoProjections.delete(sessionID);
        reviewCycles.delete(sessionID);
    }
    bindings.set(sessionID, { change: trimmed, mode });
}

/**
 * Look up the binding recorded for one session.
 *
 * @param sessionID OpenCode session identifier from the hook input.
 * @returns The active binding, or undefined when the session never ran a
 * SpecOps lifecycle tool in this process.
 */
export function getSessionBinding(sessionID: string): SessionBinding | undefined {
    return bindings.get(sessionID);
}

/**
 * Claim the first Todo refresh marker slot for one assistant message.
 *
 * Lifecycle tool wrappers receive the message id even though the generic
 * after-hook for builtin tools does not. Missing ids fail open so a host API
 * shape change cannot suppress publication.
 */
export function claimTodoRefreshForMessage(sessionID: string, messageID: string): boolean {
    if (!sessionID || !messageID) return true;
    if (lastTodoRefreshMessage.get(sessionID) === messageID) return false;
    lastTodoRefreshMessage.set(sessionID, messageID);
    return true;
}

/** Remember a successful projection for fail-stale Todo publication. */
export function rememberTodoProjection(sessionID: string, todos: readonly NativeTodoItem[]): void {
    if (!sessionID) return;
    rememberedTodoProjections.set(
        sessionID,
        todos.map(todo => ({ ...todo })),
    );
}

/** Return a copy of the last successful projection for one session. */
export function getRememberedTodoProjection(sessionID: string): NativeTodoItem[] | undefined {
    const todos = rememberedTodoProjections.get(sessionID);
    return todos?.map(todo => ({ ...todo }));
}

/**
 * Record that one session passed the implementation-entry gate.
 *
 * Observed from the coordinator's permission-gated `specops_apply_instructions`
 * call — the seam the contract crosses when implementation begins. The flag
 * only advances the Todo projection's lifecycle stages (immediate visibility
 * before the first task checkbox lands); it never persists and never feeds
 * workflow routing. Subagent sessions carry their own session ids, so their
 * calls never pollute a coordinator's flag.
 *
 * @param sessionID OpenCode session identifier from the hook input.
 */
export function markImplementationEntered(sessionID: string): void {
    if (sessionID) implementationEntered.add(sessionID);
}

/**
 * Whether one session was observed passing the implementation-entry gate.
 *
 * @param sessionID OpenCode session identifier from the hook input.
 */
export function hasEnteredImplementation(sessionID: string): boolean {
    return implementationEntered.has(sessionID);
}

/**
 * Replace one session's observed review-cycle state.
 *
 * @param sessionID OpenCode session identifier from the hook input.
 * @param observation The latest verdict and active round, if any.
 */
export function recordReviewCycle(sessionID: string, observation: ReviewCycleObservation): void {
    if (!sessionID) return;
    reviewCycles.set(sessionID, observation);
}

/** Return the observed review-cycle state for one session, if any. */
export function getReviewCycle(sessionID: string): ReviewCycleObservation | undefined {
    return reviewCycles.get(sessionID);
}

/** Drop one session's observed review-cycle state. */
export function clearReviewCycle(sessionID: string): void {
    reviewCycles.delete(sessionID);
}

/**
 * Finalize one session's remembered projection after an observed successful
 * archive, marking every entry complete.
 *
 * After an archive the active change no longer exists, so later publications
 * cannot rebuild from durable state — the terminal list must be prepared at
 * observation time from the last successful projection, which the publication
 * hook then republishes whenever its durable read fails. Without a remembered
 * projection there is nothing to finalize and publication degrades as usual;
 * a later successful publication replaces the finalized list with a fresh
 * projection.
 *
 * @param sessionID OpenCode session identifier from the tool context.
 */
export function recordArchivedChange(sessionID: string): void {
    if (!sessionID) return;
    const remembered = rememberedTodoProjections.get(sessionID);
    if (remembered) {
        rememberedTodoProjections.set(
            sessionID,
            remembered.map(todo => ({ ...todo, status: "completed" as const })),
        );
    }
}

/** Clear every binding and gate flag; test isolation only. */
export function __resetSessionBindingsForTesting(): void {
    bindings.clear();
    lastTodoRefreshMessage.clear();
    rememberedTodoProjections.clear();
    implementationEntered.clear();
    reviewCycles.clear();
}
