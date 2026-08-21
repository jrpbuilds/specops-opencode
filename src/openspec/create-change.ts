import { runCaptureStdout } from "../helpers.js";
import { errorMessage, formatCommandFailure, isRecord } from "./helpers.js";
import type { CaptureStdout } from "./helpers.js";
import { assertNoExtraFields, assertShape, OpenSpecShapeError, type Schema } from "./validation.js";

/** Normalized result of creating one named OpenSpec change. */
export type OpenSpecCreateChangeResult =
    { ok: true; name: string; path: string } | { ok: false; error: string };

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

    let result: { stdout: string; exitCode: number | null };
    try {
        result = await capture("openspec", args, cwd);
    } catch (error) {
        return { ok: false, error: `Unable to run OpenSpec create change: ${errorMessage(error)}` };
    }

    if (result.exitCode === null) {
        return {
            ok: false,
            error: "OpenSpec create change was terminated before returning a result",
        };
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(result.stdout);
    } catch {
        return {
            ok: false,
            error: `OpenSpec create change returned invalid JSON${result.stdout ? `: ${result.stdout}` : ""}`,
        };
    }

    if (!isRecord(parsed)) {
        return { ok: false, error: "OpenSpec create change returned an invalid result" };
    }

    if (result.exitCode === 0) {
        try {
            assertShape(parsed, createChangeSchema, "openspec create change");
            const validated = parsed as Record<string, unknown>;
            assertNoExtraFields(validated, createChangeSchema, "openspec create change");
            const created = validated.change as Record<string, unknown>;
            assertNoExtraFields(
                created,
                createChangeSchema.change.schema!,
                "openspec create change change",
            );
            return {
                ok: true,
                name: created.id as string,
                path: created.path as string,
            };
        } catch (error) {
            if (error instanceof OpenSpecShapeError) return { ok: false, error: error.message };
        }
    }

    return {
        ok: false,
        error: formatCommandFailure(
            parsed as Record<string, unknown>,
            result.exitCode,
            "create change",
        ),
    };
}
