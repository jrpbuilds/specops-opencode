import { runCaptureStdout } from "../helpers.js";
import { errorMessage, formatCommandFailure, isRecord } from "./helpers.js";
import type { CaptureStdout } from "./helpers.js";

/** Stable dependency facts exposed by the OpenSpec instructions wrapper. */
export type NormalizedInstructionDependency = {
    id: string;
    path: string;
    done?: boolean;
    description?: string;
};

/** Stable per-artifact authoring instructions exposed by the wrapper. */
export type NormalizedInstructions = {
    id: string;
    resolvedOutputPath: string;
    template: string;
    instruction: string;
    dependencies: readonly NormalizedInstructionDependency[];
    context?: string;
    rules?: string;
    skipped?: boolean;
    warning?: string;
};

/** Result of reading and normalizing OpenSpec instructions. */
export type OpenSpecInstructionsResult =
    { ok: true; instructions: NormalizedInstructions } | { ok: false; error: string };

/**
 * Read authoritative authoring instructions for one OpenSpec artifact.
 *
 * The wrapper only validates and normalizes the command response. It does not
 * resolve output globs or make routing and workflow decisions.
 */
export async function getOpenSpecInstructions(
    artifactId: string,
    change: string,
    cwd: string,
    capture: CaptureStdout = runCaptureStdout,
): Promise<OpenSpecInstructionsResult> {
    let result: { stdout: string; exitCode: number | null };
    try {
        result = await capture(
            "openspec",
            ["instructions", artifactId, "--change", change, "--json"],
            cwd,
        );
    } catch (error) {
        return { ok: false, error: `Unable to run OpenSpec instructions: ${errorMessage(error)}` };
    }

    if (result.exitCode === null) {
        return {
            ok: false,
            error: "OpenSpec instructions was terminated before returning a result",
        };
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(result.stdout);
    } catch {
        return {
            ok: false,
            error: `OpenSpec instructions returned invalid JSON${result.stdout ? `: ${result.stdout}` : ""}`,
        };
    }

    if (!isRecord(parsed)) {
        return { ok: false, error: "OpenSpec instructions returned an invalid result" };
    }

    if (result.exitCode !== 0 || !isInstructionsResponse(parsed)) {
        return { ok: false, error: formatCommandFailure(parsed, result.exitCode, "instructions") };
    }

    return { ok: true, instructions: normalizeInstructions(parsed) };
}

/**
 * Type guard for the full `openspec instructions --json` response.
 *
 * Validates the required `artifactId`/`resolvedOutputPath`/`template`/
 * `instruction`/`dependencies` fields plus the optional `context`/`rules`/
 * `skipped`/`warning` fields, so the normalizer can spread the optionals
 * without re-checking their types.
 */
function isInstructionsResponse(value: Record<string, unknown>): value is Record<
    string,
    unknown
> & {
    artifactId: string;
    resolvedOutputPath: string;
    template: string;
    instruction: string;
    dependencies: Array<Record<string, unknown>>;
} {
    return (
        typeof value.artifactId === "string" &&
        typeof value.resolvedOutputPath === "string" &&
        typeof value.template === "string" &&
        typeof value.instruction === "string" &&
        Array.isArray(value.dependencies) &&
        value.dependencies.every(isInstructionDependency) &&
        (!("context" in value) || typeof value.context === "string") &&
        (!("rules" in value) || typeof value.rules === "string") &&
        (!("skipped" in value) || typeof value.skipped === "boolean") &&
        (!("warning" in value) || typeof value.warning === "string")
    );
}

/** Type guard for one entry of the instructions response `dependencies` array. */
function isInstructionDependency(value: unknown): value is Record<string, unknown> & {
    id: string;
    path: string;
} {
    if (!isRecord(value) || typeof value.id !== "string" || typeof value.path !== "string") {
        return false;
    }
    return (
        (!("done" in value) || typeof value.done === "boolean") &&
        (!("description" in value) || typeof value.description === "string")
    );
}

/**
 * Flatten a validated CLI response into the stable `NormalizedInstructions`.
 *
 * Maps the CLI's `artifactId` to the wrapper's `id`, preserves
 * `resolvedOutputPath` verbatim (callers expand globs), and conditionally
 * spreads the optional `context`/`rules`/`skipped`/`warning` fields so the
 * normalized shape omits them when the CLI omits them.
 */
function normalizeInstructions(
    value: Record<string, unknown> & {
        artifactId: string;
        resolvedOutputPath: string;
        template: string;
        instruction: string;
        dependencies: Array<Record<string, unknown>>;
    },
): NormalizedInstructions {
    return {
        id: value.artifactId,
        resolvedOutputPath: value.resolvedOutputPath,
        template: value.template,
        instruction: value.instruction,
        dependencies: value.dependencies.map(dependency => ({
            id: dependency.id as string,
            path: dependency.path as string,
            ...(!("done" in dependency) ? {} : { done: dependency.done as boolean }),
            ...(!("description" in dependency)
                ? {}
                : { description: dependency.description as string }),
        })),
        ...(!("context" in value) ? {} : { context: value.context as string }),
        ...(!("rules" in value) ? {} : { rules: value.rules as string }),
        ...(!("skipped" in value) ? {} : { skipped: value.skipped as boolean }),
        ...(!("warning" in value) ? {} : { warning: value.warning as string }),
    };
}
