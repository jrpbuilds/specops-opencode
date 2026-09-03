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
 * Exports: `SessionBinding`, `recordSessionBinding`, `getSessionBinding`,
 * `__resetSessionBindingsForTesting`.
 */
import { SPECOPS_AGENT_ID, SPECOPS_AUTO_AGENT_ID } from "../agents/coordinator.js";
import type { TodoProjectionMode } from "../coordinator/todo-projection.js";

/** One session's active SpecOps change and coordinator mode. */
export type SessionBinding = {
    change: string;
    mode: TodoProjectionMode;
};

const bindings = new Map<string, SessionBinding>();

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
    if (agent === SPECOPS_AUTO_AGENT_ID) {
        bindings.set(sessionID, { change: trimmed, mode: "auto" });
        return;
    }
    if (agent === SPECOPS_AGENT_ID) {
        bindings.set(sessionID, { change: trimmed, mode: "interactive" });
    }
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

/** Clear every binding; test isolation only. */
export function __resetSessionBindingsForTesting(): void {
    bindings.clear();
}
