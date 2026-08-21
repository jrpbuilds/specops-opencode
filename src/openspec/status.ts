import { runCaptureStdout } from "../helpers.js";
import { errorMessage, formatCommandFailure, isRecord } from "./helpers.js";
import type { CaptureStdout } from "./helpers.js";
import { assertNoExtraFields, assertShape, OpenSpecShapeError, type Schema } from "./validation.js";

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

const artifactPathSchema: Schema = {
    outputPath: { kind: "string", required: true },
    resolvedOutputPath: { kind: "string", required: true },
    existingOutputPaths: { kind: "stringArray", required: true },
};

const artifactSchema: Schema = {
    id: { kind: "string", required: true },
    outputPath: { kind: "string", required: true },
    status: { kind: "string", required: true },
    requires: { kind: "stringArray", required: true },
    missingDeps: { kind: "stringArray", required: false },
};

/** Read and strictly normalize authoritative status for one named change. */
export async function getOpenSpecStatus(
    change: string,
    cwd: string,
    capture: CaptureStdout = runCaptureStdout,
): Promise<OpenSpecStatusResult> {
    let result: { stdout: string; exitCode: number | null };
    try {
        result = await capture("openspec", ["status", "--change", change, "--json"], cwd);
    } catch (error) {
        return { ok: false, error: `Unable to run OpenSpec status: ${errorMessage(error)}` };
    }

    if (result.exitCode === null) {
        return { ok: false, error: "OpenSpec status was terminated before returning a result" };
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(result.stdout);
    } catch {
        return {
            ok: false,
            error: `OpenSpec status returned invalid JSON${result.stdout ? `: ${result.stdout}` : ""}`,
        };
    }

    if (result.exitCode !== 0) {
        if (!isRecord(parsed))
            return { ok: false, error: "OpenSpec status returned an invalid result" };
        return { ok: false, error: formatCommandFailure(parsed, result.exitCode, "status") };
    }

    try {
        assertShape(parsed, statusSchema, "openspec status");
        const validated = parsed as Record<string, unknown>;
        assertNoExtraFields(validated, statusSchema, "openspec status");
        const artifacts = validated.artifacts as Array<Record<string, unknown>> | undefined;
        if (artifacts) {
            for (const artifact of artifacts) {
                assertNoExtraFields(artifact, artifactSchema, "openspec status artifact");
            }
        }
        const artifactPaths = validated.artifactPaths as Record<string, Record<string, unknown>>;
        for (const artifactPath of Object.values(artifactPaths)) {
            assertShape(artifactPath, artifactPathSchema, "openspec status artifact path");
            assertNoExtraFields(artifactPath, artifactPathSchema, "openspec status artifact path");
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
