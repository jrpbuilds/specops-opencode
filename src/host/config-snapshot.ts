import type { SpecOpsConfig } from "../config.js";

/**
 * Process-effective SpecOps configuration captured at plugin startup.
 *
 * The plugin's `config()` hook loads and validates the on-disk `specops.json`
 * once via `loadConfig` and stores the result here. All SpecOps settings
 * require an OpenCode restart to take effect, so this snapshot is intentionally
 * frozen for the process lifetime: coordinator tools read from this holder
 * rather than re-reading the file, which keeps their view of effective policy
 * aligned with the configuration that produced the currently-registered agents.
 */

let processConfig: SpecOpsConfig | undefined;

/**
 * Capture the validated SpecOps configuration loaded by the plugin's `config()` hook.
 *
 * Called once at plugin startup. The configuration is deep-cloned so the snapshot
 * is frozen for the OpenCode process lifetime — SpecOps settings require a
 * restart to take effect, and callers cannot mutate the captured value after
 * the fact. In production the plugin already receives a fresh object from
 * `loadConfig()`, so the clone is a defensive guarantee rather than a hot path.
 */
export function setProcessConfig(config: SpecOpsConfig): void {
    processConfig = structuredClone(config);
}

/**
 * Read the process-effective SpecOps configuration.
 *
 * @throws Error if the plugin `config()` hook has not yet populated the snapshot.
 *     Production code paths always populate the snapshot before any coordinator
 *     tool executes; tests must call {@link setProcessConfig} in their setup.
 *     Throwing (rather than lazy-loading) preserves snapshot semantics and
 *     surfaces plugin-init ordering bugs loudly instead of masking them with
 *     freshly-reloaded values that may differ from what produced the registered
 *     agents.
 */
export function getProcessConfig(): SpecOpsConfig {
    if (!processConfig) {
        throw new Error(
            "SpecOps process configuration snapshot is not initialized; " +
                "the plugin config() hook must run before any coordinator tool executes.",
        );
    }
    return processConfig;
}

/**
 * Test-only: clear the captured snapshot so the next read throws.
 *
 * Exported for test isolation only; production code must not call this.
 */
export function __resetProcessConfigForTesting(): void {
    processConfig = undefined;
}
