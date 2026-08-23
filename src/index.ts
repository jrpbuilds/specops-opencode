import { Plugin } from "@opencode-ai/plugin";
import { loadConfig } from "./config.js";
import { registerAgents } from "./host/agents.js";
import { registerCommands } from "./host/commands.js";
import { registerLifecycleToolVisibility } from "./host/authorization.js";
import { registerTools } from "./host/tools/index.js";

/** Native OpenCode 2 server plugin entrypoint. */
export default Plugin.define({
    id: "specops",
    tui: true,
    setup: async ctx => {
        let specOpsConfig;
        try {
            specOpsConfig = await loadConfig();
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            console.warn(
                "SpecOps: failed to load configuration, agent registration skipped:",
                reason,
            );
        }

        await registerAgents(ctx, specOpsConfig);
        await registerCommands(ctx);
        await registerTools(ctx);
        await registerLifecycleToolVisibility(ctx);
    },
});
