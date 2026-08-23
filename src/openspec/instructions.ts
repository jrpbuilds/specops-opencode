import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { runCaptureStdout } from "../helpers.js";
import { errorMessage, formatCommandFailure, isRecord } from "./helpers.js";
import { formatRemediation } from "./remediation.js";
import type { CaptureStdout } from "./helpers.js";
import { assertShape, OpenSpecShapeError, type Schema } from "./validation.js";

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

/** Validates one artifact dependency entry from `openspec instructions --json`. */
const dependencySchema: Schema = {
    id: { kind: "string", required: true },
    path: { kind: "string", required: true },
    done: { kind: "boolean", required: false },
    description: { kind: "string", required: false },
};

/** Validates the planning-home block reported by `openspec instructions --json`. */
const planningHomeSchema: Schema = {
    kind: { kind: "string", required: true },
    root: { kind: "string", required: true },
    changesDir: { kind: "string", required: true },
    defaultSchema: { kind: "string", required: true },
};

/** Validates the OpenSpec root descriptor shared by wrapper responses. */
const rootSchema: Schema = {
    path: { kind: "string", required: true },
    source: { kind: "string", required: true },
};

/** Validates the `openspec instructions <artifact> --change <name> --json` response shape. */
const instructionsSchema: Schema = {
    changeName: { kind: "string", required: true },
    artifactId: { kind: "string", required: true },
    schemaName: { kind: "string", required: true },
    changeDir: { kind: "string", required: true },
    planningHome: { kind: "record", required: true, schema: planningHomeSchema },
    outputPath: { kind: "string", required: true },
    resolvedOutputPath: { kind: "string", required: true },
    existingOutputPaths: { kind: "stringArray", required: true },
    description: { kind: "string", required: true },
    instruction: { kind: "string", required: true },
    unlocks: { kind: "stringArray", required: true },
    root: { kind: "record", required: true, schema: rootSchema },
    template: { kind: "string", required: false },
    dependencies: {
        kind: "record",
        required: false,
        arrayItem: { kind: "record", required: true, schema: dependencySchema },
    } as never,
    context: { kind: "string", required: false },
    rules: { kind: "string", required: false },
    skipped: { kind: "boolean", required: false },
    warning: { kind: "string", required: false },
};

/** Read authoritative authoring instructions for one OpenSpec artifact. */
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

    if (result.exitCode !== 0) {
        if (!isRecord(parsed))
            return { ok: false, error: "OpenSpec instructions returned an invalid result" };
        return { ok: false, error: formatCommandFailure(parsed, result.exitCode, "instructions") };
    }

    try {
        assertShape(parsed, instructionsSchema, "openspec instructions");
        const validated = parsed as Record<string, unknown>;
        const dependencies = (validated.dependencies ?? []) as Array<Record<string, unknown>>;

        const outputPath = validated.resolvedOutputPath as string;
        if (!isUsableOutputPath(outputPath)) {
            return {
                ok: false,
                error: formatRemediation("OPENSPEC_OUTPUT_PATH_INVALID", {
                    path: outputPath,
                    id: validated.artifactId as string,
                    change,
                    wrapper: "openspec instructions",
                }),
            };
        }

        return {
            ok: true,
            instructions: normalizeInstructions(validated, dependencies),
        };
    } catch (error) {
        if (error instanceof OpenSpecShapeError) return { ok: false, error: error.message };
        return { ok: false, error: "OpenSpec instructions returned an invalid result" };
    }
}

/** Whether an instructions-reported output path is absolute and file-backed. */
function isUsableOutputPath(outputPath: string): boolean {
    if (!outputPath.trim() || !path.isAbsolute(outputPath)) return false;
    const parent = path.dirname(outputPath);
    if (!existsSync(parent)) return false;
    if (!existsSync(outputPath)) return true;
    try {
        return statSync(outputPath).isFile();
    } catch {
        return false;
    }
}

/** Project the validated raw response onto the normalized instructions shape. */
function normalizeInstructions(
    value: Record<string, unknown>,
    dependencies: Array<Record<string, unknown>>,
): NormalizedInstructions {
    return {
        id: value.artifactId as string,
        resolvedOutputPath: value.resolvedOutputPath as string,
        template: (value.template ?? value.description) as string,
        instruction: value.instruction as string,
        dependencies: dependencies.map(dependency => ({
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
