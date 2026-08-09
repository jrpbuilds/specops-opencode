import { spawn } from "node:child_process";

/**
 * Run a command without exposing its output and require a zero exit status.
 *
 * This is appropriate for fire-and-forget commands whose callers only need to
 * distinguish success from failure. Both non-zero exits and process-spawn
 * errors reject the returned promise.
 */
export function runExitZero(command: string, args: string[], cwd?: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { cwd, stdio: "ignore" });
        child.on("error", reject);
        child.on("exit", code => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
    });
}

/**
 * Run a command while capturing stderr for a human-readable failure report.
 *
 * Non-zero exits are represented by `ok: false` so callers can decide how to
 * describe command-specific failures; only spawn errors reject the promise.
 */
export function runCaptured(
    command: string,
    args: string[],
    cwd?: string,
): Promise<{ ok: boolean; stderr: string }> {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
        const chunks: Buffer[] = [];
        child.stderr?.on("data", (chunk: Buffer) => chunks.push(chunk));
        child.on("error", reject);
        child.on("exit", code => {
            const stderr = Buffer.concat(chunks).toString("utf8").trim();
            resolve({ ok: code === 0, stderr });
        });
    });
}

/**
 * Run a command and resolve with captured stdout and its exit status.
 *
 * A non-zero exit is returned rather than rejected so callers can interpret
 * command-specific failures. `exitCode` is `null` when the process is
 * terminated by a signal; only spawn errors reject the promise.
 */
export function runCaptureStdout(
    command: string,
    args: string[],
    cwd?: string,
): Promise<{ stdout: string; exitCode: number | null }> {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "ignore"] });
        const chunks: Buffer[] = [];
        child.stdout?.on("data", (chunk: Buffer) => chunks.push(chunk));
        child.on("error", reject);
        child.on("exit", exitCode => {
            resolve({ stdout: Buffer.concat(chunks).toString("utf8").trim(), exitCode });
        });
    });
}
