import { runCaptureStdout } from "../helpers.js";

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
