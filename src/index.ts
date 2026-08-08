import type { Config, Plugin } from "@opencode-ai/plugin";
import { doctorTool } from "./tools/doctor.js";
import { onboardTool } from "./tools/onboard.js";

/** The only commands exposed by the walking skeleton. */
export const COMMANDS = {
    specops: {
        description: "Receive a SpecOps command",
        template: "SpecOps command received",
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

/** Register the fixed confirmation commands and the onboarding tool. */
export const SpecOpsPlugin: Plugin = async () => ({
    config: async (config: Config) => {
        config.command ??= {};
        Object.assign(config.command, COMMANDS);
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
