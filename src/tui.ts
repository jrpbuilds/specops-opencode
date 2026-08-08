/** Native OpenCode TUI editor for SpecOps role model and variant mappings. */
import type { TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui";
import { ALL_AGENT_IDS, type AgentId } from "./agents/ids.js";
import { loadConfig, saveConfig, type SpecOpsConfig } from "./config.js";
import {
    agentSettingsCategory,
    clearConfiguredModel,
    configuredModels,
    createConfigDraft,
    selectConfiguredModel,
    validateConfigSelections,
    type ConfiguredModel,
} from "./models.js";

const COMMAND_NAME = "specops.models.configure";
const BACK = Symbol("specops-back");

/** Register the Ctrl+P command-palette entry for model configuration. */
export function registerModelSettings(api: TuiPluginApi): void {
    let editorOpen = false;

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

/** Open a staged editor and save only after the complete mapping is valid. */
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
    const finish = (): void => {
        if (closed) return;
        closed = true;
        onClose();
    };
    const close = (): void => {
        api.ui.dialog.clear();
        finish();
    };

    const showIssues = (issues: readonly string[]): void => {
        api.ui.dialog.replace(() =>
            api.ui.DialogAlert({
                title: "Complete the model mapping",
                message: issues.join("\n"),
                onConfirm: showAgents,
            }),
        );
    };

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
                    "Only model configuration is stored.",
                ].join("\n"),
                onConfirm: save,
                onCancel: showAgents,
            }),
        );
    };

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

    const showAgents = (): void => {
        api.ui.dialog.setSize("xlarge");
        const unresolved = new Set(
            validateConfigSelections(staged, models).map(issue => issue.split(":")[0]),
        );
        const changed = new Set(changedAgentIds(initial, staged));
        const roleOptions = ALL_AGENT_IDS.map(id => ({
            // "!" = saved model unavailable in the current catalogue; "*" = staged change.
            title: `${unresolved.has(id) ? "! " : ""}${changed.has(id) ? "* " : ""}${id}`,
            value: id,
            category: agentSettingsCategory(id),
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
                            title: "Review and save",
                            value: "__save__",
                            category: "Actions",
                            description: "Validate all mappings and write the configuration",
                            footer: `${changed.size} changed`,
                        },
                        {
                            title: "Cancel",
                            value: "__cancel__",
                            category: "Actions",
                            description: "Discard staged changes",
                        },
                    ],
                    onSelect: option => {
                        if (option.value === "__save__") {
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

/** Describe one selected role mapping in the role list. */
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

/** Return roles whose staged model or variant differs from the opened config. */
function changedAgentIds(initial: SpecOpsConfig, staged: SpecOpsConfig): readonly AgentId[] {
    return ALL_AGENT_IDS.filter(
        id => JSON.stringify(initial.agents[id]) !== JSON.stringify(staged.agents[id]),
    );
}

/** TUI entry point loaded from the package's ./tui export. */
const SpecOpsTuiPlugin = {
    id: "specops",
    tui: async (api: TuiPluginApi) => {
        registerModelSettings(api);
    },
} satisfies TuiPluginModule;

export default SpecOpsTuiPlugin;
