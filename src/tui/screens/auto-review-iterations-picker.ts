import { MAX_AUTO_REVIEW_ITERATIONS_SELECTABLE, MIN_AUTO_REVIEW_ITERATIONS } from "../../config.js";
import { effectiveAutoReviewIterations } from "../display.js";
import type { EditorNavigator, EditorSession } from "../editor-session.js";

const AUTO_REVIEW_ITERATION_OPTIONS: readonly number[] = Array.from(
    {
        length: MAX_AUTO_REVIEW_ITERATIONS_SELECTABLE - MIN_AUTO_REVIEW_ITERATIONS + 1,
    },
    (_, i) => MIN_AUTO_REVIEW_ITERATIONS + i,
);

/**
 * Show the Auto review correction budget choices and stage the selection.
 *
 * Values above the selectable range remain valid when configured directly in
 * specops.json. Choosing any TUI option is an explicit replacement of that
 * manually configured value.
 *
 * @param session Open editor session holding staged state.
 * @param nav Navigator used to return to the role list after selection.
 * @returns Nothing; the iteration-budget dialog replaces the current view.
 */
export function openAutoReviewIterationsPicker(session: EditorSession, nav: EditorNavigator): void {
    const { api, staged } = session;
    const current = effectiveAutoReviewIterations(staged);
    api.ui.dialog.replace(() =>
        api.ui.DialogSelect<number>({
            title:
                current > MAX_AUTO_REVIEW_ITERATIONS_SELECTABLE
                    ? `Auto review iterations (manual: ${current})`
                    : "Auto review iterations",
            placeholder: "Choose Auto review budget",
            current,
            options: AUTO_REVIEW_ITERATION_OPTIONS.map(value => ({
                title: String(value),
                value,
                description: `${value} correction/re-review iteration${value === 1 ? "" : "s"}`,
            })),
            onSelect: option => {
                staged.maxAutoReviewIterations = Number(option.value);
                nav.showRoleList();
            },
        }),
    );
}
