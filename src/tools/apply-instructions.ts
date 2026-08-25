import type { ApplyInstructionsResult } from "../openspec/apply-instructions.js";

/** Dependency boundary for the deterministic OpenSpec apply-instructions tool. */
export type ApplyInstructionsDeps = {
    getApplyInstructions: (change: string) => Promise<ApplyInstructionsResult>;
};

/** Return the canonical normalized apply context for one named change. */
export async function applyInstructions(
    change: string,
    deps: ApplyInstructionsDeps,
): Promise<string> {
    const name = change.trim();
    if (!name) return "An OpenSpec change name is required.";

    const result = await deps.getApplyInstructions(name);
    if (!result.ok) {
        return `Failed to read OpenSpec apply instructions for '${name}': ${result.error}`;
    }
    return JSON.stringify(result.context, null, 2);
}
