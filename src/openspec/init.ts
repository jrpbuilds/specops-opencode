import { stat } from "node:fs/promises";
import path from "node:path";
import { runCaptured } from "../helpers.js";

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
