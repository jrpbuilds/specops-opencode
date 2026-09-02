import { FANOUT_MODES, type FanoutMode } from "../../config.js";
import type { EditorNavigator, EditorSession } from "../editor-session.js";

/** Which staged fan-out option the picker edits. */
export type FanoutKind = "implementer" | "review";

/** Display metadata for one fan-out option's picker. */
const SETTINGS: Record<
    FanoutKind,
    { title: string; placeholder: string; descriptions: Record<FanoutMode, string> }
> = {
    implementer: {
        title: "Implementer fan-out",
        placeholder: "Choose fan-out mode",
        descriptions: {
            auto: "Parallel lanes only for larger, segregated work",
            always: "Prefer parallel lanes whenever work is safely segregated",
            never: "Always one whole-list implementer",
        },
    },
    review: {
        title: "Review fan-out",
        placeholder: "Choose fan-out mode",
        descriptions: {
            auto: "Three critics for larger or riskier changes",
            always: "Always run all three review critics",
            never: "Always a single final reviewer",
        },
    },
};

/**
 * Show the choices for one fan-out option and stage the selection.
 *
 * @param session Open editor session holding staged state.
 * @param nav Navigator used to return to the role list after selection.
 * @param kind Which fan-out option is being edited.
 * @returns Nothing; the fan-out dialog replaces the current view.
 */
export function openFanoutModePicker(
    session: EditorSession,
    nav: EditorNavigator,
    kind: FanoutKind,
): void {
    const { api, staged } = session;
    const setting = SETTINGS[kind];
    const current: FanoutMode =
        kind === "implementer" ? staged.implementerFanout : staged.reviewFanout;
    api.ui.dialog.replace(() =>
        api.ui.DialogSelect<FanoutMode>({
            title: setting.title,
            placeholder: setting.placeholder,
            current,
            options: FANOUT_MODES.map(mode => ({
                title: mode,
                value: mode,
                description: setting.descriptions[mode],
            })),
            onSelect: option => {
                if (kind === "implementer") {
                    staged.implementerFanout = option.value;
                } else {
                    staged.reviewFanout = option.value;
                }
                nav.showRoleList();
            },
        }),
    );
}
