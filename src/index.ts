import type { Config, Plugin } from "@opencode-ai/plugin";
import { onboardTool } from "./tools/onboard.js";

/** The only commands exposed by the walking skeleton. */
export const COMMANDS = {
    specops: {
        description: "Receive a SpecOps command",
        template: "SpecOps command received",
    },
    "specops-doctor": {
        description: "Receive a SpecOps doctor command",
        template: "SpecOps doctor command received",
    },
    "specops-onboard": {
        description: "Onboard the current project for OpenSpec",
        template:
            "Call the specops_onboard tool to onboard the current project for OpenSpec, then report its result to the user.",
    },
} satisfies NonNullable<Config["command"]>;

/** Register the fixed confirmation commands and the onboarding tool. */
export const SpecOpsPlugin: Plugin = async () => ({
    config: async (config: Config) => {
        config.command ??= {};
        Object.assign(config.command, COMMANDS);
    },
    tool: {
        specops_onboard: onboardTool,
    },
});

/** Server entry point consumed by OpenCode's plugin loader. */
export default {
    id: "specops",
    server: SpecOpsPlugin,
} satisfies import("@opencode-ai/plugin").PluginModule;
