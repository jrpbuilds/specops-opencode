import { runCaptureStdout } from "./helpers.js";

type CaptureStdout = (
    command: string,
    args: string[],
    cwd?: string,
) => Promise<{ stdout: string; exitCode: number | null }>;

/**
 * Return the installed Engram CLI version, or `null` when it cannot run.
 *
 * Version probing is intentionally best-effort because SpecOps treats Engram
 * as an optional enhancement: an unavailable CLI is a reportable environment
 * state, never an exception and never a blocker.
 */
export async function isEngramAvailable(
    capture: CaptureStdout = runCaptureStdout,
): Promise<string | null> {
    try {
        const result = await capture("engram", ["--version"]);
        if (result.exitCode !== 0 || result.exitCode === null) return null;
        return result.stdout.trim() || null;
    } catch {
        return null;
    }
}
