import { runCaptureStdout } from "../helpers.js";
import { errorMessage, isRecord } from "./helpers.js";

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
