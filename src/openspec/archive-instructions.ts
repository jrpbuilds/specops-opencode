import { runCaptureStdout } from "../helpers.js";
import { errorMessage, formatCommandFailure, isRecord } from "./helpers.js";
import type { CaptureStdout } from "./helpers.js";
import { assertShape, OpenSpecShapeError, type Schema } from "./validation.js";

/** The normalized archive-instruction context consumed by SpecOps. */
export type NormalizedArchiveInstructionContext = {
    changeName: string;
    context?: string;
    operationGuidance?: readonly string[];
};

/** Result of reading and normalizing OpenSpec archive instructions. */
export type ArchiveInstructionsResult =
    { ok: true; context: NormalizedArchiveInstructionContext } | { ok: false; error: string };

/** Validates the `openspec instructions archive --json` response shape. */
export const archiveInstructionsSchema: Schema = {
    changeName: { kind: "string", required: true },
    context: { kind: "string", required: false },
    operationGuidance: { kind: "stringArray", required: false },
};

/** Read and normalize the authoritative archive context for one change. */
export async function getArchiveInstructions(
    change: string,
    cwd: string,
    capture: CaptureStdout = runCaptureStdout,
): Promise<ArchiveInstructionsResult> {
    let result: { stdout: string; exitCode: number | null };
    try {
        result = await capture(
            "openspec",
            ["instructions", "archive", "--change", change, "--json"],
            cwd,
        );
    } catch (error) {
        return {
            ok: false,
            error: `Unable to run OpenSpec instructions archive: ${errorMessage(error)}`,
        };
    }

    if (result.exitCode === null) {
        return {
            ok: false,
            error: "OpenSpec instructions archive was terminated before returning a result",
        };
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(result.stdout);
    } catch {
        return {
            ok: false,
            error: `OpenSpec instructions archive returned invalid JSON${result.stdout ? `: ${result.stdout}` : ""}`,
        };
    }

    if (result.exitCode !== 0) {
        if (!isRecord(parsed)) {
            return {
                ok: false,
                error: "OpenSpec instructions archive returned an invalid result",
            };
        }
        return {
            ok: false,
            error: formatCommandFailure(parsed, result.exitCode, "instructions archive"),
        };
    }

    try {
        assertShape(parsed, archiveInstructionsSchema, "openspec instructions archive");
        const validated = parsed as Record<string, unknown>;
        return {
            ok: true,
            context: {
                changeName: validated.changeName as string,
                ...(typeof validated.context === "undefined"
                    ? {}
                    : { context: validated.context as string }),
                ...(typeof validated.operationGuidance === "undefined"
                    ? {}
                    : { operationGuidance: validated.operationGuidance as string[] }),
            },
        };
    } catch (error) {
        if (error instanceof OpenSpecShapeError) return { ok: false, error: error.message };
        return { ok: false, error: "OpenSpec instructions archive returned an invalid result" };
    }
}
