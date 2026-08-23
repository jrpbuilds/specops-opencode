import type { AgentId } from "../../agents/ids.js";
import { clearConfiguredModel, selectConfiguredModel, type ConfiguredModel } from "../../models.js";
import type { EditorNavigator, EditorSession } from "../editor-session.js";

/** Sentinel option value that navigates back from a drill-down screen. */
const BACK = Symbol("specops-back");

/**
 * Show variant choices for one selected model and update the staged role.
 *
 * A variant change can only happen after a model selection, so the "back"
 * action returns to this role's model picker.
 *
 * @param session Open editor session holding staged state.
 * @param nav Navigator used for back navigation and returning to the roles.
 * @param id Role whose variant is being edited.
 * @param model Selected model whose variants are offered.
 * @returns Nothing; the variant dialog replaces the current view.
 */
export function openVariantPicker(
    session: EditorSession,
    nav: EditorNavigator,
    id: AgentId,
    model: ConfiguredModel,
): void {
    const { api, staged } = session;
    const variants = ["", ...model.variants];
    api.ui.dialog.replace(() =>
        api.ui.DialogSelect<string | typeof BACK>({
            title: `${id}: variant`,
            placeholder: "Search variants",
            current: staged.agents[id].variant ?? "",
            options: [
                ...variants.map(variant => ({
                    title: variant || "Default",
                    value: variant,
                    description: variant ? `OpenCode variant ${variant}` : "Use the model default",
                })),
                {
                    title: "Back to models",
                    value: BACK,
                    description: "Choose a different model for this role",
                },
            ],
            onSelect: option => {
                if (option.value === BACK) {
                    nav.showModelPicker(id);
                    return;
                }
                staged.agents[id] = {
                    model: staged.agents[id].model,
                    ...(option.value ? { variant: option.value } : {}),
                };
                nav.showRoleList();
            },
        }),
    );
}

/**
 * Show configured model choices for one role and update the staged role.
 *
 * Selecting a model advances to its variant picker so the variant can be
 * re-validated against the newly selected model.
 *
 * @param session Open editor session holding staged state.
 * @param nav Navigator used for back navigation and advancing to variants.
 * @param id Role whose model is being edited.
 * @returns Nothing; the model dialog replaces the current view.
 */
export function openModelPicker(session: EditorSession, nav: EditorNavigator, id: AgentId): void {
    const { api, models, staged } = session;
    api.ui.dialog.replace(() =>
        api.ui.DialogSelect<string | typeof BACK>({
            title: `${id}: model`,
            placeholder: "Search configured models",
            current: staged.agents[id].model ?? "",
            options: [
                {
                    title: "Use OpenCode default",
                    value: "",
                    description: "Use OpenCode's configured global default model",
                },
                ...models.map(model => ({
                    title: model.name,
                    value: model.id,
                    category: model.providerName,
                    description: model.id,
                })),
                {
                    title: "Back to roles",
                    value: BACK,
                    description: "Return without changing this role",
                },
            ],
            onSelect: option => {
                if (option.value === BACK) {
                    nav.showRoleList();
                    return;
                }
                if (option.value === "") {
                    staged.agents[id] = clearConfiguredModel();
                    nav.showRoleList();
                    return;
                }
                const selected = models.find(model => model.id === option.value);
                if (!selected) return;
                staged.agents[id] = selectConfiguredModel(staged.agents[id], selected);
                nav.showVariantPicker(id, selected);
            },
        }),
    );
}
