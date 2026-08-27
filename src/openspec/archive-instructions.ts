import { runCaptureStdout } from "../helpers.js";
import { invalidResultMessage, runOpenSpecJson } from "./exec.js";
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
    const result = await runOpenSpecJson(
        "instructions archive",
        ["instructions", "archive", "--change", change, "--json"],
        { capture, cwd },
    );
    if (result.kind !== "success") return { ok: false, error: result.message };

    try {
        assertShape(result.parsed, archiveInstructionsSchema, "openspec instructions archive");
        const validated = result.parsed as Record<string, unknown>;
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
        return { ok: false, error: invalidResultMessage("instructions archive") };
    }
}
