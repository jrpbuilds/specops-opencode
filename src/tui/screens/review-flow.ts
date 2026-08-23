import { ALL_AGENT_IDS } from "../../agents/ids.js";
import { saveConfig } from "../../config.js";
import { validateConfigSelections } from "../../models.js";
import { changedAgentIds, effectiveConcurrency } from "../display.js";
import type { EditorNavigator, EditorSession } from "../editor-session.js";

/**
 * Replace the current view with validation issues and a return action.
 *
 * @param session Open editor session used to render dialogs and report errors.
 * @param nav Navigator used to return to the role list for correction.
 * @param issues Validation messages to display.
 * @returns Nothing; the current dialog is replaced.
 */
function showIssues(session: EditorSession, nav: EditorNavigator, issues: readonly string[]): void {
    session.api.ui.dialog.replace(() =>
        session.api.ui.DialogAlert({
            title: "Complete the model mapping",
            message: issues.join("\n"),
            onConfirm: nav.showRoleList,
        }),
    );
}

/**
 * Validate and persist the staged configuration, or return to correction.
 *
 * Persistence failures keep the editor open so the user can retry, mirroring
 * the behavior of validation failures.
 *
 * @param session Open editor session holding staged state.
 * @param nav Navigator used for the correction loop and post-save cleanup.
 * @returns A promise that settles after persistence or error handling.
 */
async function saveStagedConfig(session: EditorSession, nav: EditorNavigator): Promise<void> {
    const { api, models, staged } = session;
    const issues = validateConfigSelections(staged, models);
    if (issues.length) {
        showIssues(session, nav, issues);
        return;
    }
    try {
        await saveConfig(staged);
    } catch (error) {
        api.ui.toast({
            variant: "error",
            title: "SpecOps model settings",
            message: error instanceof Error ? error.message : String(error),
        });
        nav.showRoleList();
        return;
    }
    session.close();
    api.ui.toast({
        variant: "success",
        title: "SpecOps model settings saved",
        message: "Restart or reload OpenCode to apply the new role mappings.",
    });
}

/**
 * Show the confirmation dialog after validating the staged choices.
 *
 * The summary reports how many role selections changed plus the resulting
 * global options, and only persists once the user confirms.
 *
 * @param session Open editor session holding staged state.
 * @param nav Navigator used for the correction loop and cancel path.
 * @returns Nothing; the review dialog replaces the current view.
 */
export function openReview(session: EditorSession, nav: EditorNavigator): void {
    const { api, initial, staged } = session;
    const issues = validateConfigSelections(staged, session.models);
    if (issues.length) {
        showIssues(session, nav, issues);
        return;
    }
    const changed = changedAgentIds(initial, staged).length;
    api.ui.dialog.replace(() =>
        api.ui.DialogConfirm({
            title: "Save SpecOps model mappings?",
            message: [
                `The configuration contains all ${ALL_AGENT_IDS.length} roles.`,
                `${changed} role selection${changed === 1 ? "" : "s"} changed.`,
                `Frontier escalation: ${staged.frontierEscalation ? "Enabled" : "Disabled"}.`,
                `Concurrent subagents: ${effectiveConcurrency(staged)}.`,
                "Only model mappings and these options are stored.",
            ].join("\n"),
            onConfirm: () => saveStagedConfig(session, nav),
            onCancel: nav.showRoleList,
        }),
    );
}
