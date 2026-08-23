import type { Config } from "@opencode-ai/plugin";
import { SPECOPS_AGENT_ID, SPECOPS_AUTO_AGENT_ID } from "../agents/coordinator.js";

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
    "specops-update": {
        description: "Revise an active SpecOps change's planning artifacts in place",
        agent: SPECOPS_AGENT_ID,
        template: "$ARGUMENTS",
    },
    "specops-sync": {
        description:
            "Synchronize an active SpecOps change's delta specs into main specs without archiving it.",
        agent: SPECOPS_AGENT_ID,
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
 * Merge the SpecOps command catalogue into the host configuration.
 *
 * @param config OpenCode configuration object mutated in place.
 */
export function applyCommands(config: Config): void {
    config.command ??= {};
    Object.assign(config.command, COMMANDS);
}
