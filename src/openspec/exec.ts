import { runCaptureStdout } from "../helpers.js";
import { errorMessage, formatCommandFailure, isRecord, type CaptureStdout } from "./helpers.js";

/** Policy for handling a parsed response from a non-zero process exit. */
export type NonZeroPolicy = "failure" | "passthrough" | "status-envelope";

/** Options controlling OpenSpec JSON command execution. */
export interface OpenSpecJsonOptions {
    cwd?: string;
    capture?: CaptureStdout;
    nonZero?: NonZeroPolicy;
    requireRecord?: boolean;
    terminatedName?: string;
}

/** Classified result of running and parsing an OpenSpec JSON command. */
export type OpenSpecJsonResult =
    | { kind: "success"; parsed: unknown; exitCode: number }
    | { kind: "spawn"; message: string; error: unknown }
    | { kind: "terminated"; message: string; stdout: string }
    | { kind: "invalidJson"; message: string; stdout: string }
    | { kind: "invalidResult"; message: string }
    | {
          kind: "nonZero";
          message: string;
          parsed: Record<string, unknown>;
          exitCode: number;
      };

/** Build the stable invalid-result message for one OpenSpec command. */
export function invalidResultMessage(commandName: string): string {
    return `OpenSpec ${commandName} returned an invalid result`;
}

/** Run an OpenSpec command, parse its JSON response, and classify its outcome. */
export async function runOpenSpecJson(
    commandName: string,
    args: string[],
    options: OpenSpecJsonOptions,
): Promise<OpenSpecJsonResult> {
    const capture = options.capture ?? runCaptureStdout;
    let result: { stdout: string; exitCode: number | null };
    try {
        result = await capture("openspec", args, options.cwd);
    } catch (error) {
        return {
            kind: "spawn",
            message: `Unable to run OpenSpec ${commandName}: ${errorMessage(error)}`,
            error,
        };
    }

    if (result.exitCode === null) {
        return {
            kind: "terminated",
            message: `OpenSpec ${options.terminatedName ?? commandName} was terminated before returning a result`,
            stdout: result.stdout,
        };
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(result.stdout);
    } catch {
        return {
            kind: "invalidJson",
            message: `OpenSpec ${commandName} returned invalid JSON${result.stdout ? `: ${result.stdout}` : ""}`,
            stdout: result.stdout,
        };
    }

    const nonZero = options.nonZero ?? "failure";
    if (result.exitCode !== 0 && nonZero === "failure") {
        if (!isRecord(parsed)) {
            return { kind: "invalidResult", message: invalidResultMessage(commandName) };
        }
        return {
            kind: "nonZero",
            message: formatCommandFailure(parsed, result.exitCode, commandName),
            parsed,
            exitCode: result.exitCode,
        };
    }

    if (
        result.exitCode !== 0 &&
        nonZero === "status-envelope" &&
        isRecord(parsed) &&
        Array.isArray(parsed.status)
    ) {
        return {
            kind: "nonZero",
            message: formatCommandFailure(parsed, result.exitCode, commandName),
            parsed,
            exitCode: result.exitCode,
        };
    }

    if (options.requireRecord && !isRecord(parsed)) {
        return { kind: "invalidResult", message: invalidResultMessage(commandName) };
    }

    return { kind: "success", parsed, exitCode: result.exitCode };
}
