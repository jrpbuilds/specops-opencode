import { AGENT_IDS, ALL_AGENT_IDS, type AgentId } from "./agents.js";
import type { AgentConfig, SpecOpsConfig } from "./config.js";

const PLANNING_IDS = new Set<AgentId>([AGENT_IDS.explorer, AGENT_IDS.planner, AGENT_IDS.designer]);

/** A configured OpenCode model and its supported variants. */
export type ConfiguredModel = {
    id: string;
    name: string;
    providerID: string;
    providerName: string;
    variants: readonly string[];
};

/** The provider/model shape used by the OpenCode TUI state. */
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

/** A complete editable configuration and unavailable saved selections. */
export type ConfigDraft = {
    config: SpecOpsConfig;
    unresolved: readonly AgentId[];
};

/** Flatten providers into stable provider/model IDs and sort them for display. */
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

    return { config: { agents }, unresolved };
}

/** Select a model while retaining only a variant it supports. */
export function selectConfiguredModel(entry: AgentConfig, model: ConfiguredModel): AgentConfig {
    return {
        model: model.id,
        ...(entry.variant && model.variants.includes(entry.variant)
            ? { variant: entry.variant }
            : {}),
    };
}

/** Clear the role-specific model and variant so OpenCode's global default is used. */
export function clearConfiguredModel(): AgentConfig {
    return {};
}

/** Return the existing functional grouping shown beside each role. */
export function agentSettingsCategory(id: AgentId): string {
    if (id === AGENT_IDS.coordinator) return "Coordination";
    if (PLANNING_IDS.has(id)) return "Planning";
    if (id === AGENT_IDS.implementer) return "Implementation";
    if (id === AGENT_IDS.reviewer) return "Review";
    return "Frontier";
}

/**
 * Validate staged choices against the currently configured model catalogue.
 *
 * A blank model is always valid (it means "use OpenCode's global default").
 * A variant without a model, a model that is no longer configured, and a
 * variant the selected model does not support are all reported as issues.
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
