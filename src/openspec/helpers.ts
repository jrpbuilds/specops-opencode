/** Narrow parsed CLI JSON to a non-array object suitable for field inspection. */
export function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Validate the normalized artifact shape shared by status-based wrappers. */
export function isNormalizedArtifact(value: Record<string, unknown>): boolean {
    return (
        typeof value.id === "string" &&
        typeof value.outputPath === "string" &&
        (value.status === "done" ||
            value.status === "skipped" ||
            value.status === "ready" ||
            value.status === "blocked") &&
        Array.isArray(value.requires) &&
        value.requires.every(item => typeof item === "string") &&
        (!("missingDeps" in value) ||
            (Array.isArray(value.missingDeps) &&
                value.missingDeps.every(item => typeof item === "string")))
    );
}

/** Convert an unknown caught value into a stable message suitable for a tool result. */
export function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * Extract a concise failure message from an OpenSpec JSON response.
 *
 * OpenSpec returns failures in a `status` array even when the process exits
 * non-zero. Prefer the first status entry's message and optional fix text,
 * falling back to a command-specific exit-code message when the response is
 * missing those fields.
 */
export function formatCommandFailure(
    parsed: Record<string, unknown>,
    exitCode: number,
    commandName: string,
): string {
    const status = Array.isArray(parsed.status) ? parsed.status.find(isRecord) : undefined;
    const message = typeof status?.message === "string" ? status.message : undefined;
    const fix = typeof status?.fix === "string" ? status.fix : undefined;
    if (message) return fix ? `${message} Fix: ${fix}` : message;
    return `OpenSpec ${commandName} failed with exit code ${exitCode}`;
}

/**
 * Structural type of a command runner that captures stdout alongside the exit
 * code without rejecting on non-zero exits.
 *
 * This type is kept in the OpenSpec layer rather than importing a concrete
 * helper so the canonical helpers module stays runtime-cycle-free.
 */
export type CaptureStdout = (
    command: string,
    args: string[],
    cwd?: string,
) => Promise<{ stdout: string; exitCode: number | null }>;
