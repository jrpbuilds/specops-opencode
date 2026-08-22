import { runCaptureStdout } from "../helpers.js";
import { formatCommandFailure, isRecord } from "./helpers.js";
import type { CaptureStdout } from "./helpers.js";
import { assertShape, OpenSpecShapeError, type Schema } from "./validation.js";

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

const changeSchema: Schema = {
    name: { kind: "string", required: true },
    status: { kind: "string", required: true },
    completedTasks: { kind: "number", required: true },
    totalTasks: { kind: "number", required: true },
    lastModified: { kind: "string", required: true },
};

const contextSchema: Schema = {
    changes: {
        kind: "record",
        required: true,
        arrayItem: { kind: "record", required: true, schema: changeSchema },
    } as never,
    root: {
        kind: "record",
        required: true,
        schema: {
            path: { kind: "string", required: true },
            source: { kind: "string", required: true },
        },
    },
};

/** Read current OpenSpec startup facts using the canonical list command. */
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

    if (result.exitCode !== 0) {
        if (!isRecord(parsed)) return contextError("OpenSpec list returned an invalid result");
        return contextError(formatCommandFailure(parsed, result.exitCode, "list"));
    }

    try {
        assertShape(parsed, contextSchema, "openspec list");
        const validated = parsed as Record<string, unknown>;
        const root = validated.root as Record<string, unknown>;
        const changes = validated.changes as Array<Record<string, unknown>>;

        const activeChanges = changes.map(change => ({
            name: change.name as string,
            status: change.status as string,
            completedTasks: change.completedTasks as number,
            totalTasks: change.totalTasks as number,
            lastModified: change.lastModified as string,
        }));
        const initialized = root.source !== "implicit";
        return {
            available: true,
            initialized,
            activeChanges: initialized ? activeChanges : [],
        };
    } catch (error) {
        if (error instanceof OpenSpecShapeError) return contextError(error.message);
        return contextError("OpenSpec list returned an invalid result");
    }
}

function contextError(error: string): OpenSpecContextResult {
    return { available: true, initialized: false, activeChanges: [], error };
}
