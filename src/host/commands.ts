import type { Plugin } from "@opencode-ai/plugin";
import { SPECOPS_AGENT_ID, SPECOPS_AUTO_AGENT_ID } from "../agents/coordinator.js";

export type SpecOpsCommandDefinition = {
    description: string;
    template: string;
    agent?: string;
};

/** Stable slash-command catalogue shared by the V2 command transform and tests. */
export const COMMANDS: Record<string, SpecOpsCommandDefinition> = {
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
            "Call the specops_doctor tool to run SpecOps diagnostics, then report its result to the user.",
    },
    "specops-onboard": {
        description: "Onboard the current project for OpenSpec",
        template:
            "Call the specops_onboard tool to onboard the current project for OpenSpec, then report its result to the user.",
    },
};

/** Register the SpecOps command catalogue through OpenCode 2's command draft. */
export async function registerCommands(ctx: Plugin.Context): Promise<void> {
    await ctx.command.transform(commands => {
        for (const [name, definition] of Object.entries(COMMANDS)) {
            commands.update(name, command => {
                command.name = name;
                command.description = definition.description;
                command.template = definition.template;
                if (definition.agent) command.agent = definition.agent;
                else delete command.agent;
            });
        }
    });
}
