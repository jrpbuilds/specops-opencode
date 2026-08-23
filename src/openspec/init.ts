import { stat } from "node:fs/promises";
import path from "node:path";
import { runCaptured } from "../helpers.js";
import { assertShape, OpenSpecShapeError, type Schema } from "./validation.js";

/** Validates the `openspec init` JSON result shape. */
const initResultSchema: Schema = {
    ok: { kind: "boolean", required: true },
    stderr: { kind: "string", required: true },
};

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
export async function initializeOpenSpec(cwd: string): Promise<{ ok: boolean; stderr: string }> {
    const result = await runCaptured(
        "openspec",
        ["init", "--tools", "none", "--no-animation"],
        cwd,
    );
    try {
        assertShape(result, initResultSchema, "openspec init");
        return result;
    } catch (error) {
        if (error instanceof OpenSpecShapeError) throw error;
        throw new Error("OpenSpec init returned an invalid result");
    }
}
