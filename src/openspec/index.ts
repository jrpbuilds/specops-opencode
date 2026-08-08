import { stat } from "node:fs/promises";
import path from "node:path";
import { runCaptured, runExitZero } from "../helpers.js";

/** Whether the `openspec` CLI is installed and runnable. */
export function isOpenSpecAvailable(): Promise<boolean> {
    return runExitZero("openspec", ["--version"]).then(
        () => true,
        () => false,
    );
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
