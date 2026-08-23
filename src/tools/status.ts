import type { OpenSpecStatusResult } from "../openspec/status.js";

/** Dependency boundary for the deterministic OpenSpec status tool. */
export type StatusDeps = {
    getOpenSpecStatus: (change: string) => Promise<OpenSpecStatusResult>;
};

/** Return normalized OpenSpec workflow facts for one named change. */
export async function status(change: string, deps: StatusDeps): Promise<string> {
    const name = change.trim();
    if (!name) return "An OpenSpec change name is required.";

    const result = await deps.getOpenSpecStatus(name);
    if (!result.ok) {
        return `Failed to read OpenSpec status for '${name}': ${result.error}`;
    }
    return JSON.stringify(result.status, null, 2);
}
