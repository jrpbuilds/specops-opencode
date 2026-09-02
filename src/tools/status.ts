import { deriveEligibleActions, deriveWorkflowState } from "../coordinator/workflow-state.js";
import type { ApplyInstructionsResult } from "../openspec/apply-instructions.js";
import type { OpenSpecStatusResult } from "../openspec/status.js";

/** Dependency boundary for the deterministic OpenSpec status tool. */
export type StatusDeps = {
    getOpenSpecStatus: (change: string) => Promise<OpenSpecStatusResult>;
    getApplyInstructions: (change: string) => Promise<ApplyInstructionsResult>;
};

/**
 * Return normalized OpenSpec workflow facts for one named change.
 *
 * The normalized status is enriched with the deterministic workflow phase,
 * implement/review lifecycle legality, and the mechanically legal actions
 * derived from the same durable OpenSpec state, so the output stays one
 * projection of one source of truth. Either durable read failing fails the
 * whole call closed; the failure prefixes are non-JSON by contract.
 */
export async function status(change: string, deps: StatusDeps): Promise<string> {
    const name = change.trim();
    if (!name) return "An OpenSpec change name is required.";

    const result = await deps.getOpenSpecStatus(name);
    if (!result.ok) {
        return `Failed to read OpenSpec status for '${name}': ${result.error}`;
    }
    const apply = await deps.getApplyInstructions(name);
    if (!apply.ok) {
        return `Failed to read OpenSpec task state for '${name}': ${apply.error}`;
    }
    const { phase, lifecycle } = deriveWorkflowState(result.status, apply.context);
    const eligibleActions = deriveEligibleActions(result.status, apply.context);
    return JSON.stringify({ ...result.status, phase, lifecycle, eligibleActions }, null, 2);
}
