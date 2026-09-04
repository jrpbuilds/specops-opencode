import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SPECOPS_TODO_REFRESH } from "../src/host/tools/todo-refresh.js";

/**
 * Create a unique temporary directory and return its path plus a cleanup hook.
 * Tests pass the directory through {@link withTempDir} so cleanup is automatic.
 * The optional prefix makes failures easier to identify in operating-system
 * temporary-directory listings.
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
 * This keeps filesystem tests isolated while preserving the original exception
 * for the test runner.
 */
export async function withTempDir<T>(fn: (dir: string) => Promise<T>, prefix?: string): Promise<T> {
    const { dir, cleanup } = await makeTempDir(prefix);
    try {
        return await fn(dir);
    } finally {
        await cleanup();
    }
}

/**
 * Return a deterministic `specops.json` path below a test directory.
 *
 * The nested form exercises parent-directory creation without requiring each
 * configuration test to construct the same path manually.
 */
export function configPath(dir: string, nested = false): string {
    return nested ? path.join(dir, "nested", "specops.json") : path.join(dir, "specops.json");
}

/**
 * Strip the compact Todo refresh marker from one lifecycle tool output.
 *
 * Lifecycle tools append `SPECOPS_TODO_REFRESH` (see `../src/host/tools/todo-refresh.ts`)
 * after their JSON payload, so wrapper-output assertions that parse or compare
 * the payload strip the trailing marker first. Marker addition itself is
 * covered by the todo-refresh and tool-integration tests.
 */
export function stripTodoRefreshMarker(output: string): string {
    return output.endsWith(SPECOPS_TODO_REFRESH)
        ? output.slice(0, -SPECOPS_TODO_REFRESH.length).trimEnd()
        : output;
}
