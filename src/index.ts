import type { Config, Plugin } from "@opencode-ai/plugin";
import { loadConfig } from "./config.js";
import { applyCommands } from "./host/commands.js";
import { setProcessConfig } from "./host/config-snapshot.js";
import {
    registerAutoCoordinatorAgent,
    registerCoordinatorAgent,
    registerDesignerAgent,
    registerExplorerAgent,
    registerFrontierAgent,
    registerImplementerAgent,
    registerPlannerAgent,
    registerReviewCorrectnessAgent,
    registerReviewQualityAgent,
    registerReviewRiskAgent,
    registerReviewerAgent,
} from "./host/agents.js";
import { applyLifecycleBoundary, applyTaskBoundary } from "./host/permissions.js";
import { TOOLS } from "./host/tools/index.js";

export { COMMANDS } from "./host/commands.js";

/**
 * Build the OpenCode plugin hooks for commands, agents, and deterministic tools.
 *
 * Commands and tools are always exposed. Agent registration depends on valid
 * persisted configuration; a configuration error is warned and isolated so it
 * does not prevent the host from loading the rest of the plugin surface.
 */
export const SpecOpsPlugin: Plugin = async () => ({
    config: async (config: Config) => {
        applyCommands(config);

        // Apply host-agent boundaries before registering SpecOps roles so those
        // roles can provide their own explicit permission overrides.
        applyTaskBoundary(config);
        applyLifecycleBoundary(config);

        try {
            const specOpsConfig = await loadConfig();
            // Capture the process-effective configuration before registering
            // agents so coordinator tools (specops_config) read the same
            // validated snapshot that produced the registered agent catalogue.
            // SpecOps settings require an OpenCode restart to take effect, so
            // the snapshot is intentionally frozen for the process lifetime.
            setProcessConfig(specOpsConfig);
            registerCoordinatorAgent(config, specOpsConfig);
            registerAutoCoordinatorAgent(config, specOpsConfig);
            registerExplorerAgent(config, specOpsConfig);
            registerPlannerAgent(config, specOpsConfig);
            registerDesignerAgent(config, specOpsConfig);
            registerImplementerAgent(config, specOpsConfig);
            registerReviewerAgent(config, specOpsConfig);
            registerReviewCorrectnessAgent(config, specOpsConfig);
            registerReviewRiskAgent(config, specOpsConfig);
            registerReviewQualityAgent(config, specOpsConfig);

            if (specOpsConfig.frontierEscalation) {
                registerFrontierAgent(config, specOpsConfig);
            }
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            console.warn(
                "SpecOps: failed to load configuration, agent registration skipped:",
                reason,
            );
        }
    },
    tool: TOOLS,
});

/**
 * Package entry point consumed by OpenCode's plugin loader.
 *
 * The server factory is kept behind the module metadata so OpenCode can load
 * the plugin without importing the TUI entry point.
 */
export default {
    id: "specops",
    server: SpecOpsPlugin,
} satisfies import("@opencode-ai/plugin").PluginModule;
