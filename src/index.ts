import type { Config, Plugin } from "@opencode-ai/plugin";
import { loadConfig } from "./config.js";
import {
    registerAutoCoordinatorAgent,
    registerCoordinatorAgent,
    SPECOPS_AGENT_ID,
    SPECOPS_AUTO_AGENT_ID,
} from "./agents/coordinator.js";
import { registerExplorerAgent } from "./agents/explorer.js";
import { registerPlannerAgent } from "./agents/planner.js";
import { registerDesignerAgent } from "./agents/designer.js";
import { registerImplementerAgent } from "./agents/implementer.js";
import { registerReviewerAgent } from "./agents/reviewer.js";
import { registerFrontierAgent } from "./agents/frontier.js";
import { applyLifecycleBoundary, applyTaskBoundary } from "./agents/boundary.js";
import { doctorTool } from "./tools/doctor.js";
import { onboardTool } from "./tools/onboard.js";
import { archiveTool } from "./tools/archive.js";
import { contextTool } from "./tools/context.js";
import { createChangeTool } from "./tools/create-change.js";
import { statusTool } from "./tools/status.js";

/**
 * Slash commands installed by the plugin.
 *
 * Lifecycle tools such as archive are intentionally not duplicated as slash
 * commands; the Coordinator invokes them when the workflow reaches that step.
 */
export const COMMANDS = {
    specops: {
        description: "Run a goal under the SpecOps coordinator",
        agent: SPECOPS_AGENT_ID,
        template: "$ARGUMENTS",
    },
    "specops-auto": {
        description:
            "Run a goal under the SpecOps Auto coordinator (autonomous, no human checkpoints)",
        agent: SPECOPS_AUTO_AGENT_ID,
        template: "$ARGUMENTS",
    },
    "specops-doctor": {
        description: "Run SpecOps doctor diagnostics",
        template:
            "Call the specops_doctor tool to run SpecOps diagnostics, then report its " +
            "result to the user.",
    },
    "specops-onboard": {
        description: "Onboard the current project for OpenSpec",
        template:
            "Call the specops_onboard tool to onboard the current project for OpenSpec, then " +
            "report its result to the user.",
    },
} satisfies NonNullable<Config["command"]>;

/**
 * Build the OpenCode plugin hooks for commands, agents, and deterministic tools.
 *
 * Commands and tools are always exposed. Agent registration depends on valid
 * persisted configuration; a configuration error is warned and isolated so it
 * does not prevent the host from loading the rest of the plugin surface.
 */
export const SpecOpsPlugin: Plugin = async () => ({
    config: async (config: Config) => {
        config.command ??= {};
        Object.assign(config.command, COMMANDS);

        // Apply host-agent boundaries before registering SpecOps roles so those
        // roles can provide their own explicit permission overrides.
        applyTaskBoundary(config);
        applyLifecycleBoundary(config);

        try {
            const specOpsConfig = await loadConfig();
            registerCoordinatorAgent(config, specOpsConfig);
            registerAutoCoordinatorAgent(config, specOpsConfig);
            registerExplorerAgent(config, specOpsConfig);
            registerPlannerAgent(config, specOpsConfig);
            registerDesignerAgent(config, specOpsConfig);
            registerImplementerAgent(config, specOpsConfig);
            registerReviewerAgent(config, specOpsConfig);

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
    tool: {
        specops_archive: archiveTool,
        specops_context: contextTool,
        specops_create_change: createChangeTool,
        specops_doctor: doctorTool,
        specops_onboard: onboardTool,
        specops_status: statusTool,
    },
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
