import type { Config, Plugin } from "@opencode-ai/plugin";
import { loadConfig } from "./config.js";
import { registerCoordinatorAgent, SPECOPS_AGENT_ID } from "./agents/coordinator.js";
import { registerExplorerAgent } from "./agents/explorer.js";
import { doctorTool } from "./tools/doctor.js";
import { onboardTool } from "./tools/onboard.js";

/** The only commands exposed by the walking skeleton. */
export const COMMANDS = {
    specops: {
        description: "Run a goal under the SpecOps coordinator",
        agent: SPECOPS_AGENT_ID,
        template: "$ARGUMENTS",
    },
    "specops-doctor": {
        description: "Run SpecOps doctor diagnostics",
        template:
            "Call the specops_doctor tool to run SpecOps diagnostics, then report its result to the user.",
    },
    "specops-onboard": {
        description: "Onboard the current project for OpenSpec",
        template:
            "Call the specops_onboard tool to onboard the current project for OpenSpec, then report its result to the user.",
    },
} satisfies NonNullable<Config["command"]>;

/** Register the fixed confirmation commands, the onboarding tool, and the SpecOps primary agent. */
export const SpecOpsPlugin: Plugin = async () => ({
    config: async (config: Config) => {
        config.command ??= {};
        Object.assign(config.command, COMMANDS);

        try {
            const specOpsConfig = await loadConfig();
            registerCoordinatorAgent(config, specOpsConfig);
            registerExplorerAgent(config, specOpsConfig);
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            console.warn(
                "SpecOps: failed to load configuration, agent registration skipped:",
                reason,
            );
        }
    },
    tool: {
        specops_doctor: doctorTool,
        specops_onboard: onboardTool,
    },
});

/** Server entry point consumed by OpenCode's plugin loader. */
export default {
    id: "specops",
    server: SpecOpsPlugin,
} satisfies import("@opencode-ai/plugin").PluginModule;
