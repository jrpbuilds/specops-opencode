import {
    MAX_AUTO_REVIEW_ITERATIONS_SELECTABLE,
    MAX_SUBAGENT_CONCURRENCY_SELECTABLE,
} from "../../config.js";
import { ROLE_WORKFLOW_ORDER, type AgentId } from "../../agents/ids.js";
import { agentDisplayName, validateConfigSelections } from "../../models.js";
import { changedAgentIds, describeSelection, formatConfiguredValue } from "../display.js";
import type { EditorNavigator, EditorSession } from "../editor-session.js";

const FRONTIER_ESCALATION = "__frontier_escalation__";
const CONCURRENT_SUBAGENTS = "__concurrent_subagents__";
const AUTO_REVIEW_ITERATIONS = "__auto_review_iterations__";
const IMPLEMENTER_FANOUT = "__implementer_fanout__";
const REVIEW_FANOUT = "__review_fanout__";

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
    const concurrencyChanged = staged.maxSubagentConcurrency !== initial.maxSubagentConcurrency;
    const autoReviewIterationsChanged =
        staged.maxAutoReviewIterations !== initial.maxAutoReviewIterations;
    const implementerFanoutChanged = staged.implementerFanout !== initial.implementerFanout;
    const reviewFanoutChanged = staged.reviewFanout !== initial.reviewFanout;
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
                        footer: formatConfiguredValue(
                            staged.maxSubagentConcurrency,
                            MAX_SUBAGENT_CONCURRENCY_SELECTABLE,
                        ),
                    },
                    {
                        value: AUTO_REVIEW_ITERATIONS,
                        category: "Options",
                        title: `${autoReviewIterationsChanged ? "* " : ""}Auto review iterations`,
                        footer: formatConfiguredValue(
                            staged.maxAutoReviewIterations,
                            MAX_AUTO_REVIEW_ITERATIONS_SELECTABLE,
                        ),
                    },
                    {
                        value: IMPLEMENTER_FANOUT,
                        category: "Options",
                        title: `${implementerFanoutChanged ? "* " : ""}Implementer fan-out`,
                        footer: staged.implementerFanout,
                    },
                    {
                        value: REVIEW_FANOUT,
                        category: "Options",
                        title: `${reviewFanoutChanged ? "* " : ""}Review fan-out`,
                        footer: staged.reviewFanout,
                    },
                    {
                        title: "Review and save",
                        value: "__save__",
                        category: "Actions",
                        footer: `${changed.size + (frontierEscalationChanged ? 1 : 0) + (concurrencyChanged ? 1 : 0) + (autoReviewIterationsChanged ? 1 : 0) + (implementerFanoutChanged ? 1 : 0) + (reviewFanoutChanged ? 1 : 0)} changed`,
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
                    } else if (option.value === AUTO_REVIEW_ITERATIONS) {
                        nav.showAutoReviewIterationsPicker();
                    } else if (option.value === IMPLEMENTER_FANOUT) {
                        nav.showImplementerFanoutPicker();
                    } else if (option.value === REVIEW_FANOUT) {
                        nav.showReviewFanoutPicker();
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
