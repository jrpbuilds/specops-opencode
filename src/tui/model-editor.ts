import type { Plugin } from "@opencode-ai/plugin/tui";
import { ROLE_WORKFLOW_ORDER, type AgentId } from "../agents/ids.js";
import { loadConfig, saveConfig, type SpecOpsConfig } from "../config.js";
import {
    agentDisplayName,
    clearConfiguredModel,
    createConfigDraft,
    selectConfiguredModel,
    validateConfigSelections,
    type ConfiguredModel,
} from "../models.js";
import { changedAgentIds, describeSelection, effectiveConcurrency } from "./display.js";

const FRONTIER_ESCALATION = "__frontier_escalation__";
const CONCURRENT_SUBAGENTS = "__concurrent_subagents__";
const REVIEW = "__review__";
const CANCEL = "__cancel__";
const DEFAULT_MODEL = "__default_model__";
const DEFAULT_VARIANT = "__default_variant__";

/** Run the staged SpecOps configuration editor using OpenCode 2 native dialogs. */
export async function showModelEditor(ctx: Plugin.Context): Promise<void> {
    const source = await loadConfig();
    const models = await availableModels(ctx);
    if (!models.length) {
        ctx.ui.toast.show({
            variant: "error",
            title: "SpecOps model settings",
            message: "OpenCode has no configured models to select.",
        });
        return;
    }

    const initial = createConfigDraft(source, models).config;
    const staged = structuredClone(initial);

    while (true) {
        const selection = await chooseRoleOrAction(ctx, initial, staged, models);
        if (selection === undefined || selection === CANCEL) return;

        if (selection === FRONTIER_ESCALATION) {
            staged.frontierEscalation = !staged.frontierEscalation;
            continue;
        }
        if (selection === CONCURRENT_SUBAGENTS) {
            await chooseConcurrency(ctx, staged);
            continue;
        }
        if (selection === REVIEW) {
            if (await reviewAndSave(ctx, initial, staged, models)) return;
            continue;
        }

        await chooseModel(ctx, staged, selection as AgentId, models);
    }
}

async function availableModels(ctx: Plugin.Context): Promise<ConfiguredModel[]> {
    await Promise.all([
        ctx.data.location.provider.sync(ctx.location),
        ctx.data.location.model.sync(ctx.location),
    ]);
    const providers = ctx.data.location.provider.list(ctx.location) ?? [];
    const models = ctx.data.location.model.list(ctx.location) ?? [];
    const providerNames = new Map(providers.map(provider => [provider.id, provider.name]));

    return models
        .filter(model => model.enabled)
        .map(model => ({
            id: `${model.providerID}/${model.id}`,
            name: model.name,
            providerID: model.providerID,
            providerName: providerNames.get(model.providerID) ?? model.providerID,
            variants: model.variants.map(variant => variant.id).sort(),
        }))
        .sort((left, right) =>
            `${left.providerName}/${left.name}`.localeCompare(`${right.providerName}/${right.name}`),
        );
}

async function chooseRoleOrAction(
    ctx: Plugin.Context,
    initial: SpecOpsConfig,
    staged: SpecOpsConfig,
    models: readonly ConfiguredModel[],
): Promise<string | undefined> {
    const changed = new Set(changedAgentIds(initial, staged));
    const issues = new Set(validateConfigSelections(staged, models).map(issue => issue.split(":")[0]));
    const frontierChanged = initial.frontierEscalation !== staged.frontierEscalation;
    const concurrencyChanged = effectiveConcurrency(initial) !== effectiveConcurrency(staged);

    return ctx.ui.dialog.select({
        title: "SpecOps role model mappings",
        placeholder: "Search roles and options",
        options: [
            ...ROLE_WORKFLOW_ORDER.map(id => ({
                title: `${issues.has(id) ? "! " : ""}${changed.has(id) ? "* " : ""}${agentDisplayName(id)}`,
                value: id,
                category: "Model Routing",
                description: describeSelection(staged, id, models),
            })),
            {
                title: `${frontierChanged ? "* " : ""}Frontier escalation`,
                value: FRONTIER_ESCALATION,
                category: "Options",
                description: staged.frontierEscalation ? "Enabled" : "Disabled",
            },
            {
                title: `${concurrencyChanged ? "* " : ""}Concurrent subagents`,
                value: CONCURRENT_SUBAGENTS,
                category: "Options",
                description: String(effectiveConcurrency(staged)),
            },
            {
                title: "Review and save",
                value: REVIEW,
                category: "Actions",
                description: `${changed.size + (frontierChanged ? 1 : 0) + (concurrencyChanged ? 1 : 0)} changed`,
            },
            { title: "Cancel", value: CANCEL, category: "Actions", description: "Discard staged changes" },
        ],
    });
}

async function chooseModel(
    ctx: Plugin.Context,
    staged: SpecOpsConfig,
    id: AgentId,
    models: readonly ConfiguredModel[],
): Promise<void> {
    const current = staged.agents[id].model ?? DEFAULT_MODEL;
    const selected = await ctx.ui.dialog.select({
        title: `${agentDisplayName(id)} model`,
        placeholder: "Search configured models",
        current,
        options: [
            {
                title: "OpenCode default",
                value: DEFAULT_MODEL,
                category: "Default",
                description: "Inherit the invoking/default model",
            },
            ...models.map(model => ({
                title: model.name,
                value: model.id,
                category: model.providerName,
                description: model.id,
            })),
        ],
    });
    if (selected === undefined) return;
    if (selected === DEFAULT_MODEL) {
        staged.agents[id] = clearConfiguredModel();
        return;
    }

    const model = models.find(candidate => candidate.id === selected);
    if (!model) return;
    staged.agents[id] = selectConfiguredModel(staged.agents[id], model);

    if (!model.variants.length) {
        delete staged.agents[id].variant;
        return;
    }

    const variant = await ctx.ui.dialog.select({
        title: `${agentDisplayName(id)} variant`,
        current: staged.agents[id].variant ?? DEFAULT_VARIANT,
        options: [
            { title: "Default", value: DEFAULT_VARIANT, description: "Use the model's default settings" },
            ...model.variants.map(value => ({ title: value, value })),
        ],
    });
    if (variant === undefined || variant === DEFAULT_VARIANT) delete staged.agents[id].variant;
    else staged.agents[id].variant = variant;
}

async function chooseConcurrency(ctx: Plugin.Context, staged: SpecOpsConfig): Promise<void> {
    const selected = await ctx.ui.dialog.select({
        title: "Concurrent planning subagents",
        current: effectiveConcurrency(staged),
        options: [1, 2, 4, 8].map(value => ({
            title: String(value),
            value,
            description: value === 1 ? "Serial planning" : `Up to ${value} independent planning agents`,
        })),
    });
    if (selected !== undefined) staged.maxSubagentConcurrency = selected;
}

async function reviewAndSave(
    ctx: Plugin.Context,
    initial: SpecOpsConfig,
    staged: SpecOpsConfig,
    models: readonly ConfiguredModel[],
): Promise<boolean> {
    const issues = validateConfigSelections(staged, models);
    if (issues.length) {
        await ctx.ui.dialog.alert({
            title: "SpecOps configuration needs attention",
            message: issues.join("\n"),
        });
        return false;
    }

    const changed = changedAgentIds(initial, staged);
    const lines = changed.map(id => `${agentDisplayName(id)}: ${describeSelection(staged, id, models)}`);
    if (initial.frontierEscalation !== staged.frontierEscalation) {
        lines.push(`Frontier escalation: ${staged.frontierEscalation ? "Enabled" : "Disabled"}`);
    }
    if (effectiveConcurrency(initial) !== effectiveConcurrency(staged)) {
        lines.push(`Concurrent subagents: ${effectiveConcurrency(staged)}`);
    }
    if (!lines.length) lines.push("No changes");

    const confirmed = await ctx.ui.dialog.confirm({
        title: "Save SpecOps configuration?",
        message: lines.join("\n"),
        label: { confirm: "Save", cancel: "Back" },
    });
    if (!confirmed) return false;

    await saveConfig(staged);
    ctx.ui.toast.show({
        variant: "success",
        title: "SpecOps configuration saved",
        message: "Model routing and workflow options updated.",
    });
    return true;
}
