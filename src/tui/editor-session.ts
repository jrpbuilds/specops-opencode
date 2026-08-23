import type { TuiPluginApi } from "@opencode-ai/plugin/tui";
import type { AgentId } from "../agents/ids.js";
import type { SpecOpsConfig } from "../config.js";
import type { ConfiguredModel } from "../models.js";

/**
 * Shared state for one open model-settings editor session.
 *
 * `initial` is the configuration snapshot captured when the editor opened and
 * is never mutated, while `staged` accumulates in-progress edits that persist
 * only after the user confirms the review dialog. `close` and `onDialogClosed`
 * funnel every exit path through the same once-only guard so the top-level
 * editor-open lock is always released exactly once.
 */
export type EditorSession = {
    api: TuiPluginApi;
    models: readonly ConfiguredModel[];
    initial: SpecOpsConfig;
    staged: SpecOpsConfig;
    /** Clear the active dialog and release the editor-open guard. */
    close(): void;
    /** Release the editor-open guard when the active dialog is dismissed without an action. */
    onDialogClosed(): void;
};

/**
 * Navigation surface connecting the editor screens.
 *
 * Screens receive a navigator instead of importing one another, which keeps
 * the screen modules free of import cycles while the orchestrator owns the
 * wiring between them.
 */
export type EditorNavigator = {
    showRoleList(): void;
    showModelPicker(id: AgentId): void;
    showVariantPicker(id: AgentId, model: ConfiguredModel): void;
    showConcurrencyPicker(): void;
    showReview(): void;
};

/**
 * Create the once-only guard that releases the top-level editor-open lock.
 *
 * @param onClose Callback registered alongside the palette command.
 * @returns A no-argument guard that forwards to `onClose` at most once.
 */
export function createCloseGuard(onClose: () => void): () => void {
    let released = false;
    return () => {
        if (released) return;
        released = true;
        onClose();
    };
}
