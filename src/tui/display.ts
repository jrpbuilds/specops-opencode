import { ALL_AGENT_IDS, type AgentId } from "../agents/ids.js";
import type { SpecOpsConfig } from "../config.js";
import type { ConfiguredModel } from "../models.js";

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
export function describeSelection(
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
export function effectiveConcurrency(config: SpecOpsConfig): number {
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
export function changedAgentIds(initial: SpecOpsConfig, staged: SpecOpsConfig): readonly AgentId[] {
    return ALL_AGENT_IDS.filter(
        id => JSON.stringify(initial.agents[id]) !== JSON.stringify(staged.agents[id]),
    );
}
