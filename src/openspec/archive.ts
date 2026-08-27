import { runCaptureStdout } from "../helpers.js";
import { formatCommandFailure } from "./helpers.js";
import type { CaptureStdout } from "./helpers.js";
import { runOpenSpecJson } from "./exec.js";
import { assertShape, OpenSpecShapeError, type Schema } from "./validation.js";

/** Validates the `openspec archive --json` response shape. */
const archiveSchema: Schema = {
    archive: {
        kind: "record",
        required: true,
        schema: {
            change: { kind: "string", required: true },
            archivedAs: { kind: "string", required: true },
            path: { kind: "string", required: true },
            specsUpdated: { kind: "boolean", required: true },
            totals: { kind: "record", required: false },
            warnings: { kind: "stringArray", required: false },
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
export async function archiveChange(
    change: string,
    cwd: string,
    capture: CaptureStdout = runCaptureStdout,
): Promise<OpenSpecArchiveResult> {
    const result = await runOpenSpecJson("archive", ["archive", change, "--yes", "--json"], {
        cwd,
        capture,
        requireRecord: true,
    });
    if (result.kind === "nonZero") {
        return {
            ok: false,
            error: formatCommandFailure(result.parsed, result.exitCode, "archive"),
        };
    }
    if (result.kind !== "success") return { ok: false, error: result.message };

    try {
        assertShape(result.parsed, archiveSchema, "openspec archive");
        const validated = result.parsed as Record<string, unknown>;
        const archive = validated.archive as Record<string, unknown>;
        return {
            ok: true,
            archivedAs: archive.archivedAs as string,
            path: archive.path as string,
        };
    } catch (error) {
        if (error instanceof OpenSpecShapeError) return { ok: false, error: error.message };
    }

    return {
        ok: false,
        error: formatCommandFailure(
            result.parsed as Record<string, unknown>,
            result.exitCode,
            "archive",
        ),
    };
}
