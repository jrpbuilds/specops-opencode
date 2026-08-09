import { stat } from "node:fs/promises";
import path from "node:path";
import { runCaptured, runCaptureStdout } from "../helpers.js";

/**
 * Normalized result of OpenSpec's project health check.
 *
 * `initialized` describes whether a root was found, `healthy` reflects the
 * root and error-level status entries, and `issues` contains display-ready
 * status text for the doctor tool.
 */
export type OpenSpecDoctorResult = {
    initialized: boolean;
    healthy: boolean;
    issues: readonly string[];
    error?: string;
};

/**
 * Normalized result of the native OpenSpec archive operation.
 *
 * Successful results retain the archive name and filesystem path reported by
 * OpenSpec. Failures retain a concise deterministic message without exposing
 * the CLI's raw response shape to callers.
 */
export type OpenSpecArchiveResult =
    { ok: true; archivedAs: string; path: string } | { ok: false; error: string };

/**
 * Return the installed OpenSpec CLI version, or `null` when it cannot run.
 *
 * Version probing is intentionally best-effort because onboarding and doctor
 * use an unavailable CLI as a reportable environment state, not an exception.
 */
export async function getOpenSpecVersion(): Promise<string | null> {
    try {
        const result = await runCaptureStdout("openspec", ["--version"]);
        if (result.exitCode !== 0 || result.exitCode === null) return null;
        return result.stdout || null;
    } catch {
        return null;
    }
}

/**
 * Return whether the `openspec` CLI can be invoked successfully for version
 * probing, without throwing when the executable is missing.
 */
export async function isOpenSpecAvailable(): Promise<boolean> {
    return (await getOpenSpecVersion()) !== null;
}

/**
 * Check whether `cwd` is itself an initialized OpenSpec root.
 *
 * This deliberately checks only the root marker and does not search parent
 * directories; tool operations receive the session's project directory.
 */
export function isOpenSpecInitialized(cwd: string): Promise<boolean> {
    return stat(path.join(cwd, "openspec", "config.yaml")).then(
        () => true,
        () => false,
    );
}

/**
 * Initialize an OpenSpec root in `cwd` using the non-interactive tool-free mode.
 *
 * The raw success flag and stderr are preserved for the onboarding report.
 */
export function initializeOpenSpec(cwd: string): Promise<{ ok: boolean; stderr: string }> {
    return runCaptured("openspec", ["init", "--tools", "none", "--no-animation"], cwd);
}

/**
 * Run the documented non-interactive OpenSpec archive command.
 *
 * `--yes` prevents a second terminal confirmation and `--json` keeps both
 * successful and rejected archives machine-readable. `runCaptureStdout`
 * preserves stdout even when OpenSpec exits non-zero, allowing structured
 * failure messages to be reported instead of reduced to an exit code.
 *
 * This wrapper deliberately delegates archive safety and spec synchronization
 * to OpenSpec. It does not inspect tasks or review state, retry failures, or
 * manually move change directories.
 *
 * @param change The active OpenSpec change name supplied to the CLI.
 * @param cwd The project directory in which OpenSpec resolves its root.
 * @returns The normalized archive result for the calling SpecOps tool.
 */
export async function archiveChange(change: string, cwd: string): Promise<OpenSpecArchiveResult> {
    let result: { stdout: string; exitCode: number | null };
    try {
        result = await runCaptureStdout("openspec", ["archive", change, "--yes", "--json"], cwd);
    } catch (error) {
        return { ok: false, error: `Unable to run OpenSpec archive: ${errorMessage(error)}` };
    }

    if (result.exitCode === null) {
        return { ok: false, error: "OpenSpec archive was terminated before returning a result" };
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(result.stdout);
    } catch {
        return {
            ok: false,
            error: `OpenSpec archive returned invalid JSON${result.stdout ? `: ${result.stdout}` : ""}`,
        };
    }

    if (!isRecord(parsed)) {
        return { ok: false, error: "OpenSpec archive returned an invalid result" };
    }

    const archive = isRecord(parsed.archive) ? parsed.archive : null;
    if (
        result.exitCode === 0 &&
        typeof archive?.archivedAs === "string" &&
        typeof archive.path === "string"
    ) {
        return { ok: true, archivedAs: archive.archivedAs, path: archive.path };
    }

    return { ok: false, error: formatArchiveFailure(parsed, result.exitCode) };
}

/**
 * Run `openspec doctor --json` and normalize its root, health, and status data.
 *
 * Command failures, invalid JSON, and malformed response shapes are returned as
 * structured errors so the doctor tool can report them without throwing.
 */
export async function runOpenSpecDoctor(cwd: string): Promise<OpenSpecDoctorResult> {
    let result: { stdout: string; exitCode: number | null };
    try {
        result = await runCaptureStdout("openspec", ["doctor", "--json"], cwd);
    } catch (error) {
        return {
            initialized: false,
            healthy: false,
            issues: [],
            error: errorMessage(error),
        };
    }

    if (result.exitCode === null) {
        return {
            initialized: false,
            healthy: false,
            issues: [],
            error: "OpenSpec doctor was terminated before returning a result",
        };
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(result.stdout);
    } catch {
        return {
            initialized: false,
            healthy: false,
            issues: [],
            error: `OpenSpec doctor returned invalid JSON${result.stdout ? `: ${result.stdout}` : ""}`,
        };
    }

    if (!isRecord(parsed)) {
        return {
            initialized: false,
            healthy: false,
            issues: [],
            error: "OpenSpec doctor returned an invalid result",
        };
    }

    const root = isRecord(parsed.root) ? parsed.root : null;
    const issues = Array.isArray(parsed.status)
        ? parsed.status.filter(isRecord).map(formatStatus)
        : [];
    const healthy = root?.healthy === true && !issues.some(issue => issue.severity === "error");

    return {
        initialized: root !== null,
        healthy,
        issues: issues.map(issue => issue.text),
    };
}

/** Narrow parsed CLI JSON to a non-array object suitable for field inspection. */
function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Normalize one raw OpenSpec doctor status entry for the plugin result.
 *
 * The CLI may provide a code, message, and suggested fix independently. Keep
 * the result readable by combining the code with the message and appending the
 * fix on its own line. Missing or malformed fields receive safe fallbacks.
 */
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

/**
 * Extract the concise structured failure reported by OpenSpec archive.
 *
 * OpenSpec returns failures in a `status` array even when the process exits
 * non-zero. Prefer its message and optional fix text, falling back to the exit
 * code only when the response is missing those fields.
 */
function formatArchiveFailure(parsed: Record<string, unknown>, exitCode: number): string {
    const status = Array.isArray(parsed.status) ? parsed.status.find(isRecord) : undefined;
    const message = typeof status?.message === "string" ? status.message : undefined;
    const fix = typeof status?.fix === "string" ? status.fix : undefined;
    if (message) return fix ? `${message} Fix: ${fix}` : message;
    return `OpenSpec archive failed with exit code ${exitCode}`;
}

/** Convert an unknown caught value into a stable message suitable for a tool result. */
function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
