import { ROLE_WORKFLOW_ORDER, type AgentId } from "../../agents/ids.js";
import { agentDisplayName, validateConfigSelections } from "../../models.js";
import { changedAgentIds, describeSelection, effectiveConcurrency } from "../display.js";
import type { EditorNavigator, EditorSession } from "../editor-session.js";

const FRONTIER_ESCALATION = "__frontier_escalation__";
const CONCURRENT_SUBAGENTS = "__concurrent_subagents__";

/**
 * Render the role/options list that drives the editor state machine.
 *
 * Role rows carry "!" markers for saved models missing from the current
 * catalogue and "*" markers for staged changes; global options and save/cancel
 * actions dispatch through the navigator or close the session.
 *
 * @param session Open editor session holding staged state.
 * @param nav Navigator used to open the next screen.
 * @returns Nothing; the role dialog replaces the current view.
 */
export function openRoleList(session: EditorSession, nav: EditorNavigator): void {
    const { api, initial, models, staged } = session;
    api.ui.dialog.setSize("xlarge");
    const unresolved = new Set(
        validateConfigSelections(staged, models).map(issue => issue.split(":")[0]),
    );
    const changed = new Set(changedAgentIds(initial, staged));
    const frontierEscalationChanged = staged.frontierEscalation !== initial.frontierEscalation;
    const concurrencyChanged = effectiveConcurrency(staged) !== effectiveConcurrency(initial);
    const roleOptions = ROLE_WORKFLOW_ORDER.map(id => ({
        // "!" = saved model unavailable in the current catalogue; "*" = staged change.
        title: `${unresolved.has(id) ? "! " : ""}${changed.has(id) ? "* " : ""}${agentDisplayName(id)}`,
        value: id,
        category: "Model Routing",
        footer: describeSelection(staged, id, models),
    }));

    api.ui.dialog.replace(
        () =>
            api.ui.DialogSelect({
                title: "SpecOps role model mappings",
                placeholder: "Search role IDs",
                options: [
                    ...roleOptions,
                    {
                        value: FRONTIER_ESCALATION,
                        category: "Options",
                        title: `${frontierEscalationChanged ? "* " : ""}Frontier escalation`,
                        footer: staged.frontierEscalation ? "Enabled" : "Disabled",
                    },
                    {
                        value: CONCURRENT_SUBAGENTS,
                        category: "Options",
                        title: `${concurrencyChanged ? "* " : ""}Concurrent subagents`,
                        footer: String(effectiveConcurrency(staged)),
                    },
                    {
                        title: "Review and save",
                        value: "__save__",
                        category: "Actions",
                        footer: `${changed.size + (frontierEscalationChanged ? 1 : 0) + (concurrencyChanged ? 1 : 0)} changed`,
                    },
                    {
                        title: "Cancel",
                        value: "__cancel__",
                        category: "Actions",
                    },
                ],
                onSelect: option => {
                    if (option.value === FRONTIER_ESCALATION) {
                        staged.frontierEscalation = !staged.frontierEscalation;
                        nav.showRoleList();
                    } else if (option.value === CONCURRENT_SUBAGENTS) {
                        nav.showConcurrencyPicker();
                    } else if (option.value === "__save__") {
                        nav.showReview();
                    } else if (option.value === "__cancel__") {
                        session.close();
                    } else {
                        nav.showModelPicker(option.value as AgentId);
                    }
                },
            }),
        session.onDialogClosed,
    );
}
