/**
 * Native OpenCode TUI editor for SpecOps role model and variant mappings.
 *
 * The editor stages changes in memory, validates the complete mapping, and
 * writes configuration only after the user confirms the review dialog.
 */
import type { TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui";
import { ALL_AGENT_IDS, ROLE_WORKFLOW_ORDER, type AgentId } from "./agents/ids.js";
import { loadConfig, saveConfig, type SpecOpsConfig } from "./config.js";
import {
    agentDisplayName,
    clearConfiguredModel,
    configuredModels,
    createConfigDraft,
    selectConfiguredModel,
    validateConfigSelections,
    type ConfiguredModel,
} from "./models.js";

const COMMAND_NAME = "specops.models.configure";
const BACK = Symbol("specops-back");
const FRONTIER_ESCALATION = "__frontier_escalation__";
const CONCURRENT_SUBAGENTS = "__concurrent_subagents__";
const SUBAGENT_CONCURRENCY_OPTIONS = [1, 2, 4, 8] as const;

/**
 * Register the command-palette entry that opens model configuration.
 *
 * The `editorOpen` guard prevents overlapping editor sessions, while the
 * lifecycle disposer removes the command when the TUI plugin is unloaded.
 *
 * @param api OpenCode TUI API used for command registration and notifications.
 * @returns Nothing; registration is performed through the supplied API.
 */
export function registerModelSettings(api: TuiPluginApi): void {
    let editorOpen = false;

    /**
     * Open the editor once and release the guard after it closes or fails.
     *
     * @returns A promise that settles after the editor closes or reports an error.
     */
    const openEditor = async (): Promise<void> => {
        if (editorOpen) return;
        editorOpen = true;
        try {
            await showModelEditor(api, () => {
                editorOpen = false;
            });
        } catch (error) {
            editorOpen = false;
            api.ui.toast({
                variant: "error",
                title: "SpecOps model settings",
                message: error instanceof Error ? error.message : String(error),
            });
        }
    };

    const unregisterCommand = api.keymap.registerLayer({
        commands: [
            {
                namespace: "palette",
                name: COMMAND_NAME,
                title: "SpecOps Configure",
                desc: "Choose a configured OpenCode model and variant for each role",
                category: "SpecOps",
                run: openEditor,
            },
        ],
    });

    api.lifecycle.onDispose(unregisterCommand);
}

/**
 * Run the staged model-mapping editor from role selection through save/cancel.
 *
 * Dialog callbacks form a small state machine: role list -> model -> variant ->
 * role list, with review and validation before persistence. The original config
 * is never mutated while the user is browsing or cancelling.
 *
 * @param api OpenCode TUI API used to render dialogs and report errors.
 * @param onClose Callback used to release the top-level editor-open guard.
 * @returns A promise that settles after the editor has initialized.
 */
async function showModelEditor(api: TuiPluginApi, onClose: () => void): Promise<void> {
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
    const initial = structuredClone(draft.config);
    let staged = structuredClone(draft.config);

    let closed = false;
    /**
     * Release the top-level editor guard exactly once.
     *
     * @returns Nothing; the close callback is invoked at most once.
     */
    const finish = (): void => {
        if (closed) return;
        closed = true;
        onClose();
    };
    /**
     * Clear the active dialog and release the editor guard.
     *
     * @returns Nothing; the editor is marked closed.
     */
    const close = (): void => {
        api.ui.dialog.clear();
        finish();
    };

    /**
     * Replace the current view with validation issues and a return action.
     *
     * @param issues Validation messages to display.
     * @returns Nothing; the current dialog is replaced.
     */
    const showIssues = (issues: readonly string[]): void => {
        api.ui.dialog.replace(() =>
            api.ui.DialogAlert({
                title: "Complete the model mapping",
                message: issues.join("\n"),
                onConfirm: showAgents,
            }),
        );
    };

    /**
     * Validate and persist the staged configuration, or return to correction.
     *
     * @returns A promise that settles after persistence or error handling.
     */
    const save = async (): Promise<void> => {
        const issues = validateConfigSelections(staged, models);
        if (issues.length) {
            showIssues(issues);
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
            showAgents();
            return;
        }
        close();
        api.ui.toast({
            variant: "success",
            title: "SpecOps model settings saved",
            message: "Restart or reload OpenCode to apply the new role mappings.",
        });
    };

    /**
     * Show the confirmation dialog after validating the staged choices.
     *
     * @returns Nothing; the review dialog replaces the current view.
     */
    const showReview = (): void => {
        const issues = validateConfigSelections(staged, models);
        if (issues.length) {
            showIssues(issues);
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
                onConfirm: save,
                onCancel: showAgents,
            }),
        );
    };

    /**
     * Show variant choices for one selected model and update the staged role.
     *
     * @param id Role whose variant is being edited.
     * @param model Selected model whose variants are offered.
     * @returns Nothing; the variant dialog replaces the current view.
     */
    const showVariant = (id: AgentId, model: ConfiguredModel): void => {
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
                        description: variant
                            ? `OpenCode variant ${variant}`
                            : "Use the model default",
                    })),
                    {
                        title: "Back to models",
                        value: BACK,
                        description: "Choose a different model for this role",
                    },
                ],
                onSelect: option => {
                    if (option.value === BACK) {
                        showModels(id);
                        return;
                    }
                    staged.agents[id] = {
                        model: staged.agents[id].model,
                        ...(option.value ? { variant: option.value } : {}),
                    };
                    showAgents();
                },
            }),
        );
    };

    /**
     * Show configured model choices for one role and update the staged role.
     *
     * @param id Role whose model is being edited.
     * @returns Nothing; the model dialog replaces the current view.
     */
    const showModels = (id: AgentId): void => {
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
                        showAgents();
                        return;
                    }
                    if (option.value === "") {
                        staged.agents[id] = clearConfiguredModel();
                        showAgents();
                        return;
                    }
                    const selected = models.find(model => model.id === option.value);
                    if (!selected) return;
                    staged.agents[id] = selectConfiguredModel(staged.agents[id], selected);
                    showVariant(id, selected);
                },
            }),
        );
    };

    /**
     * Show the global planning concurrency choices and stage the selection.
     *
     * @returns Nothing; the concurrency dialog replaces the current view.
     */
    const showConcurrency = (): void => {
        api.ui.dialog.replace(() =>
            api.ui.DialogSelect<number>({
                title: "Concurrent subagents",
                placeholder: "Choose concurrency limit",
                current: effectiveConcurrency(staged),
                options: SUBAGENT_CONCURRENCY_OPTIONS.map(value => ({
                    title: String(value),
                    value,
                    description: `Allow up to ${value} planning subagents at once`,
                })),
                onSelect: option => {
                    staged.maxSubagentConcurrency = Number(option.value);
                    showAgents();
                },
            }),
        );
    };

    /**
     * Render the role/options list that drives the editor state machine.
     *
     * @returns Nothing; the role dialog is replaced with current staged state.
     */
    const showAgents = (): void => {
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
                            description: "Allow future Frontier escalation behavior",
                            title: `${frontierEscalationChanged ? "* " : ""}Frontier escalation`,
                            footer: staged.frontierEscalation ? "Enabled" : "Disabled",
                        },
                        {
                            value: CONCURRENT_SUBAGENTS,
                            category: "Options",
                            description: "Set the global planning subagent concurrency limit",
                            title: `${concurrencyChanged ? "* " : ""}Concurrent subagents`,
                            footer: String(effectiveConcurrency(staged)),
                        },
                        {
                            title: "Review and save",
                            value: "__save__",
                            category: "Actions",
                            description: "Validate all mappings and write the configuration",
                            footer: `${changed.size + (frontierEscalationChanged ? 1 : 0) + (concurrencyChanged ? 1 : 0)} changed`,
                        },
                        {
                            title: "Cancel",
                            value: "__cancel__",
                            category: "Actions",
                            description: "Discard staged changes",
                        },
                    ],
                    onSelect: option => {
                        if (option.value === FRONTIER_ESCALATION) {
                            staged.frontierEscalation = !staged.frontierEscalation;
                            showAgents();
                        } else if (option.value === CONCURRENT_SUBAGENTS) {
                            showConcurrency();
                        } else if (option.value === "__save__") {
                            showReview();
                        } else if (option.value === "__cancel__") {
                            close();
                        } else {
                            showModels(option.value as AgentId);
                        }
                    },
                }),
            finish,
        );
    };

    showAgents();
}

/**
 * Format one role's staged selection for the role list footer.
 *
 * Unknown saved models remain visible by ID, while long display names are
 * shortened so the role list stays readable in a narrow terminal.
 *
 * @param config Staged configuration containing the role selection.
 * @param id Role whose display value is needed.
 * @param models Models currently available from OpenCode.
 * @returns A compact model and variant description for the role footer.
 */
function describeSelection(
    config: SpecOpsConfig,
    id: AgentId,
    models: readonly ConfiguredModel[],
): string {
    const entry = config.agents[id];
    if (!entry.model?.trim()) return "OpenCode default";
    const name = models.find(model => model.id === entry.model)?.name ?? entry.model;
    const compactName = name.length > 28 ? `${name.slice(0, 28)}...` : name;
    return `${compactName} · ${entry.variant ?? "Default"}`;
}

/**
 * Resolve the staged concurrency setting while supporting older config shapes.
 *
 * @param config Staged configuration being displayed.
 * @returns The configured limit, defaulting to two planning subagents.
 */
function effectiveConcurrency(config: SpecOpsConfig): number {
    return config.maxSubagentConcurrency ?? 2;
}

/**
 * Return roles whose staged model mapping differs from the opened snapshot.
 *
 * JSON comparison is sufficient because configuration entries contain only
 * stable scalar fields and the role order is fixed by `ALL_AGENT_IDS`.
 *
 * @param initial Configuration captured when the editor opened.
 * @param staged Current in-memory configuration.
 * @returns Role ids whose model or variant selection changed.
 */
function changedAgentIds(initial: SpecOpsConfig, staged: SpecOpsConfig): readonly AgentId[] {
    return ALL_AGENT_IDS.filter(
        id => JSON.stringify(initial.agents[id]) !== JSON.stringify(staged.agents[id]),
    );
}

/**
 * TUI entry point loaded from the package's `./tui` export.
 *
 * The module intentionally exposes only the TUI factory; server-side plugin
 * registration remains in `src/index.ts`.
 */
const SpecOpsTuiPlugin = {
    id: "specops",
    tui: async (api: TuiPluginApi) => {
        registerModelSettings(api);
    },
} satisfies TuiPluginModule;

/** Export the native SpecOps TUI plugin module. */
export default SpecOpsTuiPlugin;
