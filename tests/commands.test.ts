import type { Config } from "@opencode-ai/plugin";
import { describe, expect, test } from "bun:test";
import { SPECOPS_AGENT_ID } from "../src/agents/coordinator.js";
import { EXPLORER_AGENT_ID } from "../src/agents/explorer.js";
import { PLANNER_AGENT_ID } from "../src/agents/planner.js";
import { DESIGNER_AGENT_ID } from "../src/agents/designer.js";
import { COMMANDS, SpecOpsPlugin } from "../src/index.js";
import { loadPrompt } from "../src/prompts.js";
import { AGENT_IDS } from "../src/agents/ids.js";
import { withTempDir } from "./helpers.js";

function pluginInput() {
    return {
        directory: process.cwd(),
        worktree: process.cwd(),
        project: {},
        client: {},
        serverUrl: new URL("http://127.0.0.1"),
        $() {},
        experimental_workspace: { register() {} },
    } as never;
}

describe("SpecOps server plugin", () => {
    test("registers exactly the three walking-skeleton commands", async () => {
        const hooks = await SpecOpsPlugin(pluginInput());
        const config: Config = {};
        await hooks.config?.(config);

        expect(Object.keys(config.command ?? {}).sort()).toEqual([
            "specops",
            "specops-doctor",
            "specops-onboard",
        ]);
        expect(config.command).toEqual(COMMANDS);
    });

    test("wires the specops command to the SpecOps primary agent", async () => {
        await withTempDir(async dir => {
            const original = process.env.XDG_CONFIG_HOME;
            process.env.XDG_CONFIG_HOME = dir;
            try {
                const hooks = await SpecOpsPlugin(pluginInput());
                const config: Config = {};
                await hooks.config?.(config);

                expect(config.command?.specops).toEqual({
                    description: "Run a goal under the SpecOps coordinator",
                    agent: SPECOPS_AGENT_ID,
                    template: "$ARGUMENTS",
                });
            } finally {
                process.env.XDG_CONFIG_HOME = original;
            }
        });
    });

    test("registers the SpecOps tools", async () => {
        const hooks = await SpecOpsPlugin(pluginInput());
        expect(Object.keys(hooks.tool ?? {})).toEqual(["specops_doctor", "specops_onboard"]);
    });

    test("registers the SpecOps agents with loaded Markdown prompts", async () => {
        await withTempDir(async dir => {
            const original = process.env.XDG_CONFIG_HOME;
            process.env.XDG_CONFIG_HOME = dir;
            try {
                const hooks = await SpecOpsPlugin(pluginInput());
                const config: Config = {};
                await hooks.config?.(config);

                expect(config.agent?.[SPECOPS_AGENT_ID]).toEqual({
                    description: "SpecOps coordinator for spec-driven development",
                    mode: "primary",
                    prompt: loadPrompt(AGENT_IDS.coordinator),
                });
                expect(config.agent?.[EXPLORER_AGENT_ID]).toEqual({
                    description:
                        "Investigates repository source code, existing behaviour, structure, conventions, tests, constraints and risks for the SpecOps coordinator. Use this agent for all codebase exploration.",
                    mode: "subagent",
                    prompt: loadPrompt(AGENT_IDS.explorer),
                });
                expect(config.agent?.[PLANNER_AGENT_ID]).toEqual({
                    description:
                        "Authors OpenSpec planning artifacts — proposals, capability specifications, and implementation tasks — from the user's goal and repository evidence. Use this agent for SpecOps planning artifacts.",
                    mode: "subagent",
                    prompt: loadPrompt(AGENT_IDS.planner),
                });
                expect(config.agent?.[DESIGNER_AGENT_ID]).toEqual({
                    description:
                        "Authors the technical OpenSpec design from approved requirements and repository evidence. Use this agent to create design.md for SpecOps changes.",
                    mode: "subagent",
                    prompt: loadPrompt(AGENT_IDS.designer),
                });
            } finally {
                process.env.XDG_CONFIG_HOME = original;
            }
        });
    });
});
