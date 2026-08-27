import { runCaptureStdout } from "../helpers.js";
import { errorMessage } from "./helpers.js";
import type { CaptureStdout } from "./helpers.js";
import { runOpenSpecJson } from "./exec.js";
import { assertShape, OpenSpecShapeError, type Schema } from "./validation.js";

/** Artifact states reported by the OpenSpec status command. */
export type OpenSpecArtifactStatus = "done" | "skipped" | "ready" | "blocked";

/** Stable artifact facts exposed by the status wrapper. */
export type NormalizedArtifact = {
    id: string;
    outputPath: string;
    status: OpenSpecArtifactStatus;
    requires: readonly string[];
    missingDeps?: readonly string[];
};

/** Stable workflow facts exposed by the status wrapper. */
export type NormalizedStatus = {
    changeName: string;
    schemaName: string;
    isPlanningComplete?: boolean;
    applyRequires: readonly string[];
    artifacts: readonly NormalizedArtifact[];
};

/** Result of reading and normalizing OpenSpec status. */
export type OpenSpecStatusResult =
    { ok: true; status: NormalizedStatus } | { ok: false; error: string };

/** Validates the `openspec status --change <name> --json` response shape. */
const statusSchema: Schema = {
    changeName: { kind: "string", required: true },
    schemaName: { kind: "string", required: true },
    planningHome: {
        kind: "record",
        required: true,
        schema: {
            kind: { kind: "string", required: true },
            root: { kind: "string", required: true },
            changesDir: { kind: "string", required: true },
            defaultSchema: { kind: "string", required: true },
        },
    },
    changeRoot: { kind: "string", required: true },
    artifactPaths: { kind: "record", required: true },
    isPlanningComplete: { kind: "boolean", required: true },
    isComplete: { kind: "boolean", required: true },
    nextSteps: { kind: "stringArray", required: true },
    actionContext: {
        kind: "record",
        required: true,
        schema: {
            mode: { kind: "string", required: true },
            sourceOfTruth: { kind: "string", required: true },
            planningArtifacts: { kind: "stringArray", required: true },
            linkedContext: { kind: "stringArray", required: true },
            allowedEditRoots: { kind: "stringArray", required: true },
            requiresAffectedAreaSelection: { kind: "boolean", required: true },
            constraints: { kind: "stringArray", required: true },
        },
    },
    root: {
        kind: "record",
        required: true,
        schema: {
            path: { kind: "string", required: true },
            source: { kind: "string", required: true },
        },
    },
    applyRequires: { kind: "stringArray", required: false },
    artifacts: {
        kind: "record",
        required: false,
        arrayItem: { kind: "artifact", required: true },
    } as never,
};

/** Validates the artifactPaths block consumed by dispatch and sync flows. */
const artifactPathSchema: Schema = {
    outputPath: { kind: "string", required: true },
    resolvedOutputPath: { kind: "string", required: true },
    existingOutputPaths: { kind: "stringArray", required: true },
};

/** Read and strictly normalize authoritative status for one named change. */
export async function getOpenSpecStatus(
    change: string,
    cwd: string,
    capture: CaptureStdout = runCaptureStdout,
): Promise<OpenSpecStatusResult> {
    const result = await runOpenSpecJson("status", ["status", "--change", change, "--json"], {
        capture,
        cwd,
    });
    if (result.kind !== "success") return { ok: false, error: result.message };

    try {
        assertShape(result.parsed, statusSchema, "openspec status");
        const validated = result.parsed as Record<string, unknown>;
        const artifacts = validated.artifacts as Array<Record<string, unknown>> | undefined;
        const artifactPaths = validated.artifactPaths as Record<string, Record<string, unknown>>;
        for (const artifactPath of Object.values(artifactPaths)) {
            assertShape(artifactPath, artifactPathSchema, "openspec status artifact path");
        }

        const normalizedArtifacts: NormalizedArtifact[] = artifacts
            ? (artifacts as NormalizedArtifact[])
            : Object.entries(artifactPaths).map(([id, value]) => ({
                  id,
                  outputPath: value.resolvedOutputPath as string,
                  status: (value.existingOutputPaths as string[]).length > 0 ? "done" : "ready",
                  requires: [],
              }));

        const status: NormalizedStatus = {
            changeName: validated.changeName as string,
            schemaName: validated.schemaName as string,
            applyRequires: (validated.applyRequires as string[] | undefined) ?? [],
            artifacts: normalizedArtifacts,
        };
        status.isPlanningComplete = validated.isPlanningComplete as boolean;
        return { ok: true, status };
    } catch (error) {
        return {
            ok: false,
            error: error instanceof OpenSpecShapeError ? error.message : errorMessage(error),
        };
    }
}
