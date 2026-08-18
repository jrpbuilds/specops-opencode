import { runCaptureStdout } from "../helpers.js";
import { formatCommandFailure, isRecord } from "./helpers.js";
import type { CaptureStdout } from "./helpers.js";

/** A deterministic active-change summary reported by OpenSpec. */
export type OpenSpecActiveChange = {
    name: string;
    status: string;
    completedTasks: number;
    totalTasks: number;
    lastModified: string;
};

/** Current OpenSpec facts needed by the Coordinator at startup. */
export type OpenSpecContextResult = {
    available: boolean;
    initialized: boolean;
    activeChanges: readonly OpenSpecActiveChange[];
    error?: string;
};

/**
 * Read current OpenSpec startup facts using the canonical list command.
 *
 * Spawn failures represent an unavailable CLI. A command failure or malformed
 * response remains an error rather than being mistaken for an uninitialized
 * repository. OpenSpec's root source is intentionally interpreted as
 * `source !== "implicit"` so future valid source values remain initialized.
 */
export async function getOpenSpecContext(
    cwd: string,
    capture: CaptureStdout = runCaptureStdout,
): Promise<OpenSpecContextResult> {
    let result: { stdout: string; exitCode: number | null };
    try {
        result = await capture("openspec", ["list", "--json"], cwd);
    } catch {
        return { available: false, initialized: false, activeChanges: [] };
    }

    if (result.exitCode === null) {
        return contextError("OpenSpec list was terminated before returning a result");
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(result.stdout);
    } catch {
        return contextError(
            `OpenSpec list returned invalid JSON${result.stdout ? `: ${result.stdout}` : ""}`,
        );
    }

    if (!isRecord(parsed)) return contextError("OpenSpec list returned an invalid result");

    if (result.exitCode !== 0) {
        return contextError(formatCommandFailure(parsed, result.exitCode, "list"));
    }

    const root = isRecord(parsed.root) ? parsed.root : null;
    const changes = Array.isArray(parsed.changes) ? parsed.changes : null;
    if (typeof root?.source !== "string" || !changes) {
        return contextError("OpenSpec list returned an invalid result");
    }

    const activeChanges: OpenSpecActiveChange[] = [];
    for (const change of changes) {
        if (!isRecord(change) || !isActiveChange(change)) {
            return contextError("OpenSpec list returned an invalid change result");
        }
        activeChanges.push({
            name: change.name,
            status: change.status,
            completedTasks: change.completedTasks,
            totalTasks: change.totalTasks,
            lastModified: change.lastModified,
        });
    }

    const initialized = root.source !== "implicit";
    return {
        available: true,
        initialized,
        activeChanges: initialized ? activeChanges : [],
    };
}

/** Type guard for one entry of `openspec change list`'s active-change shape. */
function isActiveChange(value: Record<string, unknown>): value is Record<string, unknown> & {
    name: string;
    status: string;
    completedTasks: number;
    totalTasks: number;
    lastModified: string;
} {
    return (
        typeof value.name === "string" &&
        typeof value.status === "string" &&
        typeof value.completedTasks === "number" &&
        typeof value.totalTasks === "number" &&
        typeof value.lastModified === "string"
    );
}

function contextError(error: string): OpenSpecContextResult {
    return { available: true, initialized: false, activeChanges: [], error };
}
