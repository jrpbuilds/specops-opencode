import { runCaptureStdout } from "../helpers.js";
import { invalidResultMessage, runOpenSpecJson } from "./exec.js";
import type { CaptureStdout } from "./helpers.js";
import { assertShape, OpenSpecShapeError, type Schema } from "./validation.js";

/** A task from the canonical OpenSpec apply-instruction context. */
export type NormalizedApplyTask = {
    id: string;
    description: string;
    done: boolean;
};

/** The normalized apply-instruction context consumed by SpecOps. */
export type NormalizedApplyInstructionContext = {
    changeName: string;
    changeDir: string;
    schemaName: string;
    contextFiles: Record<string, string[]>;
    progress: { total: number; complete: number; remaining: number };
    tasks: readonly NormalizedApplyTask[];
    state: "blocked" | "all_done" | "ready";
    instruction: string;
    missingArtifacts?: readonly string[];
    context?: string;
    operationGuidance?: readonly string[];
    references?: readonly Record<string, unknown>[];
    root?: { path: string; source: string };
    warning?: string;
};

/** Result of reading and normalizing OpenSpec apply instructions. */
export type ApplyInstructionsResult =
    { ok: true; context: NormalizedApplyInstructionContext } | { ok: false; error: string };

/** Validates the task-progress counters reported by the apply payload. */
const progressSchema: Schema = {
    total: { kind: "number", required: true },
    complete: { kind: "number", required: true },
    remaining: { kind: "number", required: true },
};

/** Validates one task entry reported in the apply payload. */
const taskSchema: Schema = {
    id: { kind: "string", required: true },
    description: { kind: "string", required: true },
    done: { kind: "boolean", required: true },
};

/** Validates the optional OpenSpec root descriptor in the apply payload. */
const rootSchema: Schema = {
    path: { kind: "string", required: true },
    source: { kind: "string", required: true },
};

/** Validates the `openspec instructions apply --json` response shape. */
export const applyInstructionsSchema: Schema = {
    changeName: { kind: "string", required: true },
    changeDir: { kind: "string", required: true },
    schemaName: { kind: "string", required: true },
    contextFiles: { kind: "record", required: true },
    progress: { kind: "record", required: true, schema: progressSchema },
    tasks: {
        kind: "record",
        required: true,
        arrayItem: { kind: "record", required: true, schema: taskSchema },
    } as never,
    state: { kind: "string", required: true },
    instruction: { kind: "string", required: true },
    missingArtifacts: { kind: "stringArray", required: false },
    context: { kind: "string", required: false },
    operationGuidance: { kind: "stringArray", required: false },
    references: {
        kind: "record",
        required: false,
        arrayItem: { kind: "record", required: true },
    } as never,
    root: { kind: "record", required: false, schema: rootSchema },
    warning: { kind: "string", required: false },
};

/** Read and normalize the authoritative apply context for one change. */
export async function getApplyInstructions(
    change: string,
    cwd: string,
    capture: CaptureStdout = runCaptureStdout,
): Promise<ApplyInstructionsResult> {
    const result = await runOpenSpecJson(
        "instructions apply",
        ["instructions", "apply", "--change", change, "--json"],
        { capture, cwd },
    );
    if (result.kind !== "success") return { ok: false, error: result.message };

    try {
        assertShape(result.parsed, applyInstructionsSchema, "openspec instructions apply");
        const validated = result.parsed as Record<string, unknown>;
        const contextFiles = validated.contextFiles as Record<string, unknown>;
        // The top-level schema confirms a record; each artifact must still contain string paths.
        for (const [artifactId, paths] of Object.entries(contextFiles)) {
            if (!Array.isArray(paths) || !paths.every(path => typeof path === "string")) {
                throw new OpenSpecShapeError(
                    "openspec instructions apply contextFiles",
                    artifactId,
                    "stringArray",
                    Array.isArray(paths) ? "array" : typeof paths,
                );
            }
        }

        const progress = validated.progress as Record<string, unknown>;
        const tasks = validated.tasks as Array<Record<string, unknown>>;
        const root = validated.root as Record<string, unknown> | undefined;
        return {
            ok: true,
            context: {
                changeName: validated.changeName as string,
                changeDir: validated.changeDir as string,
                schemaName: validated.schemaName as string,
                contextFiles: contextFiles as Record<string, string[]>,
                progress: {
                    total: progress.total as number,
                    complete: progress.complete as number,
                    remaining: progress.remaining as number,
                },
                tasks: tasks.map(task => ({
                    id: task.id as string,
                    description: task.description as string,
                    done: task.done as boolean,
                })),
                state: validated.state as NormalizedApplyInstructionContext["state"],
                instruction: validated.instruction as string,
                ...(typeof validated.missingArtifacts === "undefined"
                    ? {}
                    : { missingArtifacts: validated.missingArtifacts as string[] }),
                ...(typeof validated.context === "undefined"
                    ? {}
                    : { context: validated.context as string }),
                ...(typeof validated.operationGuidance === "undefined"
                    ? {}
                    : { operationGuidance: validated.operationGuidance as string[] }),
                ...(typeof validated.references === "undefined"
                    ? {}
                    : {
                          references: validated.references as readonly Record<string, unknown>[],
                      }),
                ...(typeof root === "undefined"
                    ? {}
                    : { root: { path: root.path as string, source: root.source as string } }),
                ...(typeof validated.warning === "undefined"
                    ? {}
                    : { warning: validated.warning as string }),
            },
        };
    } catch (error) {
        if (error instanceof OpenSpecShapeError) return { ok: false, error: error.message };
        return { ok: false, error: invalidResultMessage("instructions apply") };
    }
}
