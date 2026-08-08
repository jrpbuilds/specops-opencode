import { spawn } from "node:child_process";

/** Run a command and resolve only if it exits 0; reject on non-zero or spawn error. */
export function runExitZero(command: string, args: string[], cwd?: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { cwd, stdio: "ignore" });
        child.on("error", reject);
        child.on("exit", code => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
    });
}

/** Run a command and resolve with its exit code and captured stderr. */
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
