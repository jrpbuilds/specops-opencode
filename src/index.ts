import type { Config, Plugin } from "@opencode-ai/plugin";

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
        description: "Receive a SpecOps onboard command",
        template: "SpecOps onboard command received",
    },
} satisfies NonNullable<Config["command"]>;

/** Register the fixed confirmation commands. */
export const SpecOpsPlugin: Plugin = async () => ({
    config: async (config: Config) => {
        config.command ??= {};
        Object.assign(config.command, COMMANDS);
    },
});

/** Server entry point consumed by OpenCode's plugin loader. */
export default {
    id: "specops",
    server: SpecOpsPlugin,
} satisfies import("@opencode-ai/plugin").PluginModule;
