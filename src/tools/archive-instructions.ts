import type { ArchiveInstructionsResult } from "../openspec/archive-instructions.js";

/** Dependency boundary for the deterministic OpenSpec archive-instructions tool. */
export type ArchiveInstructionsDeps = {
    getArchiveInstructions: (change: string) => Promise<ArchiveInstructionsResult>;
};

/** Return the canonical normalized archive context for one named change. */
export async function archiveInstructions(
    change: string,
    deps: ArchiveInstructionsDeps,
): Promise<string> {
    const name = change.trim();
    if (!name) return "An OpenSpec change name is required.";

    const result = await deps.getArchiveInstructions(name);
    if (!result.ok) {
        return `Failed to read OpenSpec archive instructions for '${name}': ${result.error}`;
    }
    return JSON.stringify(result.context, null, 2);
}
