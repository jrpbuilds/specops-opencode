/**
 * Orchestrator for the staged SpecOps model-mapping editor.
 *
 * Bootstraps one editor session from persisted configuration plus the current
 * OpenCode provider catalogue, then wires the navigation graph between the
 * screen modules. Dialog callbacks form a small state machine: role list ->
 * model -> variant -> role list, with review and validation before
 * persistence. The original config is never mutated while the user is browsing
 * or cancelling.
 */
import type { TuiPluginApi } from "@opencode-ai/plugin/tui";
import { loadConfig } from "../config.js";
import { createCloseGuard, type EditorNavigator, type EditorSession } from "./editor-session.js";
import { configuredModels, createConfigDraft } from "../models.js";
import { openConcurrencyPicker } from "./screens/concurrency-picker.js";
import { openModelPicker, openVariantPicker } from "./screens/model-picker.js";
import { openReview } from "./screens/review-flow.js";
import { openRoleList } from "./screens/role-list.js";

/**
 * Run the staged model-mapping editor from role selection through save/cancel.
 *
 * @param api OpenCode TUI API used to render dialogs and report errors.
 * @param onClose Callback used to release the top-level editor-open guard.
 * @returns A promise that settles after the editor has initialized.
 */
export async function showModelEditor(api: TuiPluginApi, onClose: () => void): Promise<void> {
    const source = await loadConfig();
    const models = configuredModels(api.state.provider);
    if (!models.length) {
        onClose();
        api.ui.toast({
            variant: "error",
            title: "SpecOps model settings",
            message: "OpenCode has no configured models to select.",
        });
        return;
    }

    const draft = createConfigDraft(source, models);
    const releaseGuard = createCloseGuard(onClose);
    const session: EditorSession = {
        api,
        models,
        initial: structuredClone(draft.config),
        staged: structuredClone(draft.config),
        close() {
            api.ui.dialog.clear();
            releaseGuard();
        },
        onDialogClosed: releaseGuard,
    };

    const nav: EditorNavigator = {
        showRoleList: () => openRoleList(session, nav),
        showModelPicker: id => openModelPicker(session, nav, id),
        showVariantPicker: (id, model) => openVariantPicker(session, nav, id, model),
        showConcurrencyPicker: () => openConcurrencyPicker(session, nav),
        showReview: () => openReview(session, nav),
    };

    nav.showRoleList();
}
