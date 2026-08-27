import { ALL_AGENT_IDS, type AgentId } from "../agents/ids.js";
import { resolveAgentMapping, type SpecOpsConfig } from "../config.js";
import type { ConfiguredModel } from "../models.js";

/**
 * Format one role's staged selection for the role list footer.
 *
 * Unknown saved models remain visible by ID, while long display names are
 * shortened so the role list stays readable in a narrow terminal. Inherited
 * mappings display only their effective selection to keep rows compact.
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
    return formatSelection(resolveAgentMapping(config, id), models);
}

/** Format one effective mapping without applying role-specific inheritance copy. */
function formatSelection(
    mapping: { model?: string; variant?: string },
    models: readonly ConfiguredModel[],
): string {
    if (!mapping.model?.trim()) return "OpenCode default";
    const name = models.find(model => model.id === mapping.model)?.name ?? mapping.model;
    const compactName = name.length > 28 ? `${name.slice(0, 28)}...` : name;
    return `${compactName} · ${mapping.variant ?? "Default"}`;
}

/**
 * Mark a value that was configured above the TUI's selectable range.
 *
 * @param value Effective persisted value.
 * @param selectableMax Largest value offered by the TUI.
 * @returns A compact display value for an options row or footer.
 */
export function formatConfiguredValue(value: number, selectableMax: number): string {
    return value > selectableMax ? `${value} (manual)` : String(value);
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
