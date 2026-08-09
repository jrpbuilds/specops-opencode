import { runCaptureStdout } from "../helpers.js";
import { errorMessage, isRecord } from "./helpers.js";

/**
 * Normalized result of OpenSpec's project health check.
 *
 * `initialized` describes whether a root was found, `healthy` reflects the
 * root and error-level status entries, and `issues` contains display-ready
 * status text for the doctor tool.
 */
export type OpenSpecDoctorResult = {
    initialized: boolean;
    healthy: boolean;
    issues: readonly string[];
    error?: string;
};

/**
 * Run `openspec doctor --json` and normalize its root, health, and status data.
 *
 * Command failures, invalid JSON, and malformed response shapes are returned as
 * structured errors so the doctor tool can report them without throwing.
 */
export async function runOpenSpecDoctor(cwd: string): Promise<OpenSpecDoctorResult> {
    let result: { stdout: string; exitCode: number | null };
    try {
        result = await runCaptureStdout("openspec", ["doctor", "--json"], cwd);
    } catch (error) {
        return {
            initialized: false,
            healthy: false,
            issues: [],
            error: errorMessage(error),
        };
    }

    if (result.exitCode === null) {
        return {
            initialized: false,
            healthy: false,
            issues: [],
            error: "OpenSpec doctor was terminated before returning a result",
        };
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(result.stdout);
    } catch {
        return {
            initialized: false,
            healthy: false,
            issues: [],
            error: `OpenSpec doctor returned invalid JSON${result.stdout ? `: ${result.stdout}` : ""}`,
        };
    }

    if (!isRecord(parsed)) {
        return {
            initialized: false,
            healthy: false,
            issues: [],
            error: "OpenSpec doctor returned an invalid result",
        };
    }

    const root = isRecord(parsed.root) ? parsed.root : null;
    const issues = Array.isArray(parsed.status)
        ? parsed.status.filter(isRecord).map(formatStatus)
        : [];
    const healthy = root?.healthy === true && !issues.some(issue => issue.severity === "error");

    return {
        initialized: root !== null,
        healthy,
        issues: issues.map(issue => issue.text),
    };
}

/**
 * Normalize one raw OpenSpec doctor status entry for the plugin result.
 *
 * The CLI may provide a code, message, and suggested fix independently. Keep
 * the result readable by combining the code with the message and appending the
 * fix on its own line. Missing or malformed fields receive safe fallbacks.
 */
function formatStatus(value: Record<string, unknown>): { severity: string; text: string } {
    const code = typeof value.code === "string" ? value.code : undefined;
    const message = typeof value.message === "string" ? value.message : undefined;
    const fix = typeof value.fix === "string" ? value.fix : undefined;
    const text =
        [code, message].filter(Boolean).join(": ") || "OpenSpec reported an unspecified issue";
    return {
        severity: typeof value.severity === "string" ? value.severity : "error",
        text: fix ? `${text}\nfix: ${fix}` : text,
    };
}
