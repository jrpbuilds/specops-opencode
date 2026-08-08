import { stat } from "node:fs/promises";
import path from "node:path";
import { runCaptured, runCaptureStdout } from "../helpers.js";

/** The result of running OpenSpec's project health check. */
export type OpenSpecDoctorResult = {
    initialized: boolean;
    healthy: boolean;
    issues: readonly string[];
    error?: string;
};

/** Return the installed OpenSpec CLI version, or null when it is unavailable. */
export async function getOpenSpecVersion(): Promise<string | null> {
    try {
        const result = await runCaptureStdout("openspec", ["--version"]);
        if (result.exitCode !== 0 || result.exitCode === null) return null;
        return result.stdout || null;
    } catch {
        return null;
    }
}

/** Whether the `openspec` CLI is installed and runnable. */
export async function isOpenSpecAvailable(): Promise<boolean> {
    return (await getOpenSpecVersion()) !== null;
}

/** Whether `cwd` itself is an initialised OpenSpec root (has openspec/config.yaml). */
export function isOpenSpecInitialized(cwd: string): Promise<boolean> {
    return stat(path.join(cwd, "openspec", "config.yaml")).then(
        () => true,
        () => false,
    );
}

/** Run `openspec init --tools none --no-animation` in `cwd`. */
export function initializeOpenSpec(cwd: string): Promise<{ ok: boolean; stderr: string }> {
    return runCaptured("openspec", ["init", "--tools", "none", "--no-animation"], cwd);
}

/** Run `openspec doctor --json` and interpret its project root and health. */
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

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

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

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
