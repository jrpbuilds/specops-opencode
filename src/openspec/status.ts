import { runCaptureStdout } from "../helpers.js";
import { errorMessage, formatCommandFailure, isRecord } from "./helpers.js";
import type { CaptureStdout } from "./helpers.js";

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

/**
 * Read authoritative workflow facts for one OpenSpec change.
 *
 * The wrapper validates only the schema-agnostic fields in the public result.
 * It deliberately does not select artifacts or infer any next workflow step.
 */
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

    if (!isRecord(parsed)) {
        return { ok: false, error: "OpenSpec status returned an invalid result" };
    }

    if (result.exitCode !== 0) {
        return { ok: false, error: formatCommandFailure(parsed, result.exitCode, "status") };
    }

    if (
        typeof parsed.changeName !== "string" ||
        typeof parsed.schemaName !== "string" ||
        !isStringArray(parsed.applyRequires) ||
        !Array.isArray(parsed.artifacts) ||
        ("isPlanningComplete" in parsed && typeof parsed.isPlanningComplete !== "boolean")
    ) {
        return { ok: false, error: formatCommandFailure(parsed, result.exitCode, "status") };
    }

    const artifacts: NormalizedArtifact[] = [];
    for (const artifact of parsed.artifacts) {
        if (!isRecord(artifact) || !isNormalizedArtifact(artifact)) {
            return { ok: false, error: formatCommandFailure(parsed, result.exitCode, "status") };
        }
        artifacts.push({
            id: artifact.id,
            outputPath: artifact.outputPath,
            status: artifact.status,
            requires: artifact.requires,
            ...(artifact.missingDeps === undefined ? {} : { missingDeps: artifact.missingDeps }),
        });
    }

    const status: NormalizedStatus = {
        changeName: parsed.changeName,
        schemaName: parsed.schemaName,
        applyRequires: parsed.applyRequires,
        artifacts,
    };
    if ("isPlanningComplete" in parsed) {
        status.isPlanningComplete = parsed.isPlanningComplete as boolean;
    }

    return { ok: true, status };
}

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every(item => typeof item === "string");
}

function isNormalizedArtifact(value: Record<string, unknown>): value is Record<string, unknown> & {
    id: string;
    outputPath: string;
    status: OpenSpecArtifactStatus;
    requires: string[];
    missingDeps?: string[];
} {
    return (
        typeof value.id === "string" &&
        typeof value.outputPath === "string" &&
        isArtifactStatus(value.status) &&
        isStringArray(value.requires) &&
        (!("missingDeps" in value) || isStringArray(value.missingDeps))
    );
}

function isArtifactStatus(value: unknown): value is OpenSpecArtifactStatus {
    return value === "done" || value === "skipped" || value === "ready" || value === "blocked";
}
