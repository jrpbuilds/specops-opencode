import { runCaptureStdout } from "../helpers.js";
import { errorMessage, isRecord } from "./helpers.js";

/** Normalized result of creating one named OpenSpec change. */
export type OpenSpecCreateChangeResult =
    { ok: true; name: string; path: string } | { ok: false; error: string };

type CaptureStdout = (
    command: string,
    args: string[],
    cwd?: string,
) => Promise<{ stdout: string; exitCode: number | null }>;

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

    const created = isRecord(parsed.change) ? parsed.change : null;
    if (
        result.exitCode === 0 &&
        typeof created?.id === "string" &&
        typeof created.path === "string"
    ) {
        return { ok: true, name: created.id, path: created.path };
    }

    return { ok: false, error: formatCommandFailure(parsed, result.exitCode) };
}

function formatCommandFailure(parsed: Record<string, unknown>, exitCode: number): string {
    const status = Array.isArray(parsed.status) ? parsed.status.find(isRecord) : undefined;
    const message = typeof status?.message === "string" ? status.message : undefined;
    const fix = typeof status?.fix === "string" ? status.fix : undefined;
    if (message) return fix ? `${message} Fix: ${fix}` : message;
    return `OpenSpec create change failed with exit code ${exitCode}`;
}
