import type { Config, Plugin } from "@opencode-ai/plugin";
import { loadConfig } from "./config.js";
import { applyCommands } from "./host/commands.js";
import { setProcessConfig } from "./host/config-snapshot.js";
import {
    registerAutoCoordinatorAgent,
    registerCoordinatorAgent,
    registerWorkflowSubagents,
} from "./host/agents.js";
import { applyLifecycleBoundary, applyTaskBoundary } from "./host/permissions.js";
import {
    createSessionEventObserver,
    recordTaskDispatch,
    recordTaskResult,
} from "./host/parallel-progress.js";
import { TOOLS } from "./host/tools/index.js";
import { createTodoDisplayHook } from "./host/todo-display.js";
import { createTodoSyncHook } from "./host/todo-sync.js";
import { getApplyInstructions } from "./openspec/apply-instructions.js";
import { getOpenSpecStatus } from "./openspec/status.js";

export { COMMANDS } from "./host/commands.js";

/**
 * Build the OpenCode plugin hooks for commands, agents, and deterministic tools.
 *
 * Commands and tools are always exposed. Agent registration depends on valid
 * persisted configuration; a configuration error is warned and isolated so it
 * does not prevent the host from loading the rest of the plugin surface.
 */
export const SpecOpsPlugin: Plugin = async input => {
    const todoSyncHook = createTodoSyncHook({
        directory: input.directory,
        getOpenSpecStatus,
        getApplyInstructions,
    });
    const todoDisplayHook = createTodoDisplayHook();

    return {
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
                registerWorkflowSubagents(config, specOpsConfig);
            } catch (error) {
                const reason = error instanceof Error ? error.message : String(error);
                console.warn(
                    "SpecOps: failed to load configuration, agent registration skipped:",
                    reason,
                );
            }
        },
        tool: TOOLS,
        // Compose the tool.execute.before hooks: dispatch observation feeds the
        // runtime's parallel-progress tracking, and the Todo sync hook publishes
        // the runtime-owned projection by intercepting the builtin todowrite tool
        // for sessions that ran a SpecOps lifecycle tool, replacing the model's
        // blind refresh-trigger payload with the canonical projection rebuilt
        // from fresh durable state.
        "tool.execute.before": async (input, output) => {
            await recordTaskDispatch(input, output);
            await todoSyncHook(input, output);
        },
        // Compose the tool.execute.after hooks: task results resolve tracked
        // dispatches, and the display hook suppresses the builtin's `# Todos`
        // transcript blocks by emptying the display metadata the renderer gates
        // on — the sidebar keeps showing the persisted projection.
        "tool.execute.after": async (input, output) => {
            await recordTaskResult(input, output);
            await todoDisplayHook(input, output);
        },
        // Resolve background-dispatch outcomes from subagent session lifecycle:
        // session.idle completes, session.error/session.deleted fail, and
        // session.created corroborates the child-session link when the
        // background envelope could not be parsed.
        event: createSessionEventObserver(),
    };
};

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
