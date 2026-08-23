import { AGENT_IDS, ALL_AGENT_IDS, type AgentId } from "./agents/ids.js";
import type { AgentConfig, SpecOpsConfig } from "./config.js";

const AGENT_DISPLAY_NAMES: Record<AgentId, string> = {
    [AGENT_IDS.coordinator]: "Coordinator",
    [AGENT_IDS.explorer]: "Explorer",
    [AGENT_IDS.planner]: "Planner",
    [AGENT_IDS.designer]: "Designer",
    [AGENT_IDS.implementer]: "Implementer",
    [AGENT_IDS.reviewer]: "Reviewer",
    [AGENT_IDS.frontier]: "Frontier",
};

/**
 * A normalized OpenCode model exposed to the SpecOps configuration editor.
 *
 * `id` is the provider/model value persisted in SpecOps configuration, while
 * `name` and `providerName` are display labels. Variants are sorted for stable
 * selection order.
 */
export type ConfiguredModel = {
    id: string;
    name: string;
    providerID: string;
    providerName: string;
    variants: readonly string[];
};

/**
 * The provider catalogue shape supplied by OpenCode's TUI state.
 *
 * OpenCode keys models by provider-local IDs, so normalization must retain the
 * provider ID when constructing the persisted `provider/model` identifier.
 */
export type ConfiguredProvider = {
    id: string;
    name: string;
    models: Readonly<
        Record<
            string,
            {
                id: string;
                providerID: string;
                name: string;
                variants?: Readonly<Record<string, unknown>>;
            }
        >
    >;
};

/**
 * The staged editor configuration and roles whose saved models are unavailable.
 *
 * `unresolved` is informational for the UI; it lets a user repair a stale
 * saved selection without discarding the rest of the configuration.
 */
export type ConfigDraft = {
    config: SpecOpsConfig;
    unresolved: readonly AgentId[];
};

/**
 * Flatten OpenCode providers into normalized models and stable display order.
 *
 * Provider-local model IDs become `provider/model` IDs, variants are sorted,
 * and the final list is ordered by provider name and model name for the TUI.
 *
 * @param providers Provider catalogue returned by OpenCode.
 * @returns Normalized models in stable display order.
 */
export function configuredModels(
    providers: readonly ConfiguredProvider[],
): readonly ConfiguredModel[] {
    return providers
        .flatMap(provider =>
            Object.values(provider.models).map(model => ({
                id: `${model.providerID || provider.id}/${model.id}`,
                name: model.name,
                providerID: model.providerID || provider.id,
                providerName: provider.name,
                variants: Object.keys(model.variants ?? {}).sort(),
            })),
        )
        .sort((left, right) =>
            `${left.providerName}/${left.name}`.localeCompare(
                `${right.providerName}/${right.name}`,
            ),
        );
}

/**
 * Build an editable complete configuration from persisted choices.
 *
 * `unresolved` lists roles whose saved `model` is not present in the current
 * OpenCode provider catalogue, so the editor can flag them. A blank model is
 * valid (global default) and therefore never unresolved.
 *
 * @param source Validated persisted configuration to stage.
 * @param models Models currently available from OpenCode.
 * @returns A complete editable configuration and unresolved role ids.
 */
export function createConfigDraft(
    source: SpecOpsConfig,
    models: readonly ConfiguredModel[],
): ConfigDraft {
    const available = new Set(models.map(model => model.id));
    const agents = {} as SpecOpsConfig["agents"];
    const unresolved: AgentId[] = [];

    for (const id of ALL_AGENT_IDS) {
        const entry = source.agents[id];
        const model = entry.model?.trim() ? entry.model : undefined;
        agents[id] = {
            ...(model ? { model } : {}),
            ...(entry.variant ? { variant: entry.variant } : {}),
        };
        if (model && !available.has(model)) unresolved.push(id);
    }

    return {
        config: {
            agents,
            frontierEscalation: source.frontierEscalation,
            maxSubagentConcurrency: source.maxSubagentConcurrency,
        },
        unresolved,
    };
}

/**
 * Select a model for one role and preserve its variant only when still valid.
 *
 * A model change can invalidate the previously selected variant, so invalid
 * variants are intentionally dropped instead of being persisted.
 *
 * @param entry Current role model and variant selection.
 * @param model Newly selected normalized model.
 * @returns The updated role selection with only a compatible variant retained.
 */
export function selectConfiguredModel(entry: AgentConfig, model: ConfiguredModel): AgentConfig {
    return {
        model: model.id,
        ...(entry.variant && model.variants.includes(entry.variant)
            ? { variant: entry.variant }
            : {}),
    };
}

/**
 * Clear a role's explicit model mapping so it inherits OpenCode's global default.
 *
 * Returning a fresh empty object also removes any stale variant at the same
 * time.
 *
 * @returns An empty role configuration inheriting OpenCode's default model.
 */
export function clearConfiguredModel(): AgentConfig {
    return {};
}

/** Return the friendly role name shown in the configuration editor. */
export function agentDisplayName(id: AgentId): string {
    return AGENT_DISPLAY_NAMES[id];
}

/**
 * Validate staged choices against the currently configured model catalogue.
 *
 * A blank model is always valid (it means "use OpenCode's global default").
 * A variant without a model, a model that is no longer configured, and a
 * variant the selected model does not support are all reported as issues.
 * The function returns every issue so the editor can present one complete
 * correction list instead of failing on the first invalid role.
 *
 * @param config Staged configuration being checked.
 * @param models Models currently available from OpenCode.
 * @returns All detected model and variant selection issues.
 */
export function validateConfigSelections(
    config: SpecOpsConfig,
    models: readonly ConfiguredModel[],
): readonly string[] {
    const available = new Map(models.map(model => [model.id, model]));
    const issues: string[] = [];

    for (const id of ALL_AGENT_IDS) {
        const entry = config.agents[id];
        const modelId = entry.model?.trim();
        if (!modelId) {
            if (entry.variant?.trim())
                issues.push(`${id}: variant ${entry.variant} requires a model`);
            continue;
        }

        const model = available.get(modelId);
        if (!model) {
            issues.push(`${id}: model ${modelId} is not currently configured`);
        } else if (entry.variant && !model.variants.includes(entry.variant)) {
            issues.push(`${id}: variant ${entry.variant} is unavailable for ${modelId}`);
        }
    }

    return issues;
}
