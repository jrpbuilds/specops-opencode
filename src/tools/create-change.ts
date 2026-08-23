import type { OpenSpecCreateChangeResult } from "../openspec/create-change.js";

/** Dependency boundary for deterministic OpenSpec change creation. */
export type CreateChangeDeps = {
    createChange: (change: string, goal?: string) => Promise<OpenSpecCreateChangeResult>;
};

/**
 * Request creation of one named OpenSpec change.
 *
 * This validates only the required input and leaves name rules and workflow
 * policy to OpenSpec and the Coordinator respectively.
 */
export async function createChange(
    change: string,
    goal: string | undefined,
    deps: CreateChangeDeps,
): Promise<string> {
    const name = change.trim();
    if (!name) return "An OpenSpec change name is required.";

    const trimmedGoal = goal?.trim();
    const result = await deps.createChange(name, trimmedGoal || undefined);
    if (!result.ok) return `Failed to create OpenSpec change '${name}': ${result.error}`;
    return `OpenSpec change '${result.name}' created successfully at ${result.path}.`;
}
