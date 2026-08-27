import { runCaptureStdout } from "../helpers.js";
import { formatCommandFailure } from "./helpers.js";
import type { CaptureStdout } from "./helpers.js";
import { runOpenSpecJson } from "./exec.js";
import { assertShape, OpenSpecShapeError, type Schema } from "./validation.js";

/** Normalized result of creating one named OpenSpec change. */
export type OpenSpecCreateChangeResult =
    { ok: true; name: string; path: string } | { ok: false; error: string };

/** Validates the `openspec new change --json` response shape. */
const createChangeSchema: Schema = {
    change: {
        kind: "record",
        required: true,
        schema: {
            id: { kind: "string", required: true },
            path: { kind: "string", required: true },
            metadataPath: { kind: "string", required: true },
            schema: { kind: "string", required: true },
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
 * Create a change through OpenSpec's canonical non-interactive command.
 *
 * The requested name is passed through unchanged. OpenSpec remains responsible
 * for name validation, duplicate detection, schema selection, and filesystem
 * writes; this operation only normalizes the native JSON result.
 */
export async function createOpenSpecChange(
    change: string,
    cwd: string,
    goal?: string,
    capture: CaptureStdout = runCaptureStdout,
): Promise<OpenSpecCreateChangeResult> {
    const args = ["new", "change", change];
    if (goal) args.push("--goal", goal);
    args.push("--json");

    const result = await runOpenSpecJson("create change", args, {
        cwd,
        capture,
        requireRecord: true,
    });
    if (result.kind === "nonZero") {
        return {
            ok: false,
            error: formatCommandFailure(result.parsed, result.exitCode, "create change"),
        };
    }
    if (result.kind !== "success") return { ok: false, error: result.message };

    try {
        assertShape(result.parsed, createChangeSchema, "openspec create change");
        const validated = result.parsed as Record<string, unknown>;
        const created = validated.change as Record<string, unknown>;
        return {
            ok: true,
            name: created.id as string,
            path: created.path as string,
        };
    } catch (error) {
        if (error instanceof OpenSpecShapeError) return { ok: false, error: error.message };
    }

    return {
        ok: false,
        error: formatCommandFailure(
            result.parsed as Record<string, unknown>,
            result.exitCode,
            "create change",
        ),
    };
}
