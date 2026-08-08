import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Create a unique temporary directory and return its path plus a cleanup hook.
 * Tests pass the directory through {@link withTempDir} so cleanup is automatic.
 */
export async function makeTempDir(prefix = "specops-test-"): Promise<{
    dir: string;
    cleanup: () => Promise<void>;
}> {
    const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
    return { dir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

/**
 * Run a callback with a fresh temporary directory, removing it afterwards even
 * if the callback throws. Resolves to the callback's return value.
 */
export async function withTempDir<T>(fn: (dir: string) => Promise<T>, prefix?: string): Promise<T> {
    const { dir, cleanup } = await makeTempDir(prefix);
    try {
        return await fn(dir);
    } finally {
        await cleanup();
    }
}

/** A `specops.json` path inside the supplied directory (optionally nested). */
export function configPath(dir: string, nested = false): string {
    return nested ? path.join(dir, "nested", "specops.json") : path.join(dir, "specops.json");
}
