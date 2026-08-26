import { getOpenSpecVersion } from "./cli.js";
import { probeCompatibility, type CompatibilityReport } from "./compatibility.js";
import { runCaptureStdout } from "../helpers.js";
import { formatRemediation } from "./remediation.js";
import { errorMessage, formatCommandFailure } from "./helpers.js";
import type { CaptureStdout } from "./helpers.js";
import { validateArchived, type ArchivedIssue } from "./validate.js";
import { assertShape, type Schema, OpenSpecShapeError } from "./validation.js";

/** Incompatibility details surfaced when capability probes fail. */
export type OpenSpecIncompatible = {
    missingCapabilities: { id: string; description: string }[];
    installedVersion: string | null;
    targetVersion: string;
    remediation: string;
};

/** Normalized result of OpenSpec's project health check. */
export type OpenSpecDoctorResult = {
    initialized: boolean;
    healthy: boolean;
    incompatible: OpenSpecIncompatible | null;
    issues: readonly string[];
    error?: string;
    remediation?: string;
    /** Archived-change integrity, present only when evaluated on the success path. */
    archived?: ArchivedDoctorResult;
};

/** Normalized archived-change integrity result for the doctor report. */
export type ArchivedDoctorResult = {
    state: "supported-healthy" | "supported-invalid" | "unsupported" | "errored";
    issues?: ArchivedIssue[];
    error?: string;
};

/** Signature shared by doctor's compatibility probes for test injection. */
type DoctorProbe = (
    cwd: string,
    capture: CaptureStdout,
    readVersion: () => Promise<string | null>,
) => Promise<CompatibilityReport>;

/** Validates one issue entry from `openspec doctor --json`. */
const statusEntrySchema: Schema = {
    severity: { kind: "string", required: true },
    code: { kind: "string", required: true },
    message: { kind: "string", required: true },
    fix: { kind: "string", required: false },
};

/** Validates the `openspec doctor --json` response shape. */
const doctorSchema: Schema = {
    root: {
        kind: "record",
        required: false,
        schema: {
            path: { kind: "string", required: true },
            source: { kind: "string", required: true },
            healthy: { kind: "boolean", required: true },
            status: { kind: "stringArray", required: false },
        },
    },
    status: {
        kind: "record",
        required: true,
        arrayItem: { kind: "record", required: true, schema: statusEntrySchema },
    } as never,
    store: { kind: "record", required: true, nullable: true },
    references: { kind: "stringArray", required: true },
};

/**
 * Check availability and compatibility before trusting OpenSpec doctor output.
 *
 * Compatibility is deliberately checked before `openspec doctor --json`: an
 * unsupported install cannot be trusted to produce the response contract.
 */
export async function runOpenSpecDoctor(
    cwd: string,
    capture: CaptureStdout = runCaptureStdout,
    readVersion: () => Promise<string | null> = getOpenSpecVersion,
    checkCompatibility: DoctorProbe = probeCompatibility,
): Promise<OpenSpecDoctorResult> {
    let installedVersion: string | null;
    try {
        installedVersion = await readVersion();
    } catch (error) {
        return unavailable(errorMessage(error));
    }
    if (installedVersion === null) return unavailable("OpenSpec CLI is unavailable");

    let compatibility: CompatibilityReport;
    try {
        compatibility = await checkCompatibility(cwd, capture, async () => installedVersion);
    } catch (error) {
        return unavailable(errorMessage(error));
    }

    // This branch is reachable only when a capability probe failed; a version
    // shortfall surfaces as a warning on the compatible path instead.
    if (!compatibility.compatible) {
        const missingCapabilities = compatibility.missingCapabilities.map(
            ({ id, description }) => ({
                id,
                description,
            }),
        );
        return {
            initialized: false,
            healthy: false,
            incompatible: {
                missingCapabilities,
                installedVersion: compatibility.installedVersion,
                targetVersion: compatibility.targetVersion,
                remediation: formatRemediation("OPENSPEC_INCOMPATIBLE", {
                    missingCapabilities: missingCapabilities.map(item => item.id).join(", "),
                    installedVersion: compatibility.installedVersion ?? "unknown",
                    targetVersion: compatibility.targetVersion,
                }),
            },
            issues: [],
        };
    }

    let result: { stdout: string; exitCode: number | null };
    try {
        result = await capture("openspec", ["doctor", "--json"], cwd);
    } catch (error) {
        return unavailable(errorMessage(error));
    }

    if (result.exitCode === null) {
        return failure("OpenSpec doctor was terminated before returning a result");
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(result.stdout);
    } catch {
        return failure(
            `OpenSpec doctor returned invalid JSON${result.stdout ? `: ${result.stdout}` : ""}`,
        );
    }

    try {
        assertShape(parsed, doctorSchema, "openspec doctor");
        const validated = parsed as Record<string, unknown>;
        const root = validated.root as Record<string, unknown> | undefined;
        const status = validated.status as Array<Record<string, unknown>>;
        const issues = status.map(formatStatus);
        const result: OpenSpecDoctorResult = {
            initialized: root !== undefined,
            healthy: root?.healthy === true && !issues.some(issue => issue.severity === "error"),
            incompatible: null,
            issues: [
                ...issues.map(issue => issue.text),
                ...compatibility.warnings.map(warning => `warning: ${warning}`),
            ],
        };
        if (root !== undefined) {
            result.archived = await checkArchived(cwd, capture, compatibility);
        }
        return result;
    } catch (error) {
        if (error instanceof OpenSpecShapeError) return failure(error.message);
        return failure(
            formatCommandFailure(parsed as Record<string, unknown>, result.exitCode, "doctor"),
        );
    }
}

/**
 * Run the archived-change integrity check when the capability is supported.
 *
 * The capability gates the native invocation: an unsupported install reports
 * the state without ever starting `openspec validate --archived`. Any failure
 * of the supported check maps to the errored state, never an uncaught throw,
 * so the archived sub-check can never break the base doctor result.
 */
async function checkArchived(
    cwd: string,
    capture: CaptureStdout,
    compatibility: CompatibilityReport,
): Promise<ArchivedDoctorResult> {
    if (compatibility.unsupportedCapabilities.some(item => item.id === "validate-archived")) {
        return { state: "unsupported" };
    }
    try {
        const validation = await validateArchived(cwd, capture);
        return validation.valid
            ? { state: "supported-healthy" }
            : { state: "supported-invalid", issues: validation.issues };
    } catch (error) {
        return { state: "errored", error: errorMessage(error) };
    }
}

/** Render one raw doctor issue entry as severity plus display text. */
function formatStatus(value: Record<string, unknown>): { severity: string; text: string } {
    const code = typeof value.code === "string" ? value.code : undefined;
    const message = typeof value.message === "string" ? value.message : undefined;
    const fix = typeof value.fix === "string" ? value.fix : undefined;
    const text =
        [code, message].filter(Boolean).join(": ") || "OpenSpec reported an unspecified issue";
    return {
        severity: typeof value.severity === "string" ? value.severity : "error",
        text: fix ? `${text}\nfix: ${fix}` : text,
    };
}

/** Build the result used when the OpenSpec CLI cannot be executed at all. */
function unavailable(error: string): OpenSpecDoctorResult {
    return {
        initialized: false,
        healthy: false,
        incompatible: null,
        issues: [],
        error,
        remediation: formatRemediation("OPENSPEC_UNAVAILABLE", { wrapper: "OpenSpec" }),
    };
}

/** Build the result used when doctor runs but reports a failure. */
function failure(error: string): OpenSpecDoctorResult {
    return { initialized: false, healthy: false, incompatible: null, issues: [], error };
}
