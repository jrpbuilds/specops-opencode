import { MAX_SUBAGENT_CONCURRENCY, MIN_SUBAGENT_CONCURRENCY } from "../../config.js";
import { effectiveConcurrency } from "../display.js";
import type { EditorNavigator, EditorSession } from "../editor-session.js";

const SUBAGENT_CONCURRENCY_OPTIONS: readonly number[] = Array.from(
    { length: MAX_SUBAGENT_CONCURRENCY - MIN_SUBAGENT_CONCURRENCY + 1 },
    (_, i) => MIN_SUBAGENT_CONCURRENCY + i,
);

/**
 * Show the global planning concurrency choices and stage the selection.
 *
 * @param session Open editor session holding staged state.
 * @param nav Navigator used to return to the role list after selection.
 * @returns Nothing; the concurrency dialog replaces the current view.
 */
export function openConcurrencyPicker(session: EditorSession, nav: EditorNavigator): void {
    const { api, staged } = session;
    api.ui.dialog.replace(() =>
        api.ui.DialogSelect<number>({
            title: "Concurrent subagents",
            placeholder: "Choose concurrency limit",
            current: effectiveConcurrency(staged),
            options: SUBAGENT_CONCURRENCY_OPTIONS.map(value => ({
                title: String(value),
                value,
                description: `Up to ${value} parallel subagent${value === 1 ? "" : "s"}`,
            })),
            onSelect: option => {
                staged.maxSubagentConcurrency = Number(option.value);
                nav.showRoleList();
            },
        }),
    );
}
