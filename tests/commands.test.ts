import type { Config } from "@opencode-ai/plugin";
import { describe, expect, test } from "bun:test";
import { COORDINATOR_PROMPT, SPECOPS_AGENT_ID } from "../src/agents/coordinator.js";
import { COMMANDS, SpecOpsPlugin } from "../src/index.js";
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

    test("registers the SpecOps tools", async () => {
        const hooks = await SpecOpsPlugin(pluginInput());
        expect(Object.keys(hooks.tool ?? {})).toEqual(["specops_doctor", "specops_onboard"]);
    });

    test("registers the SpecOps primary agent using the default coordinator config", async () => {
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
                    prompt: COORDINATOR_PROMPT,
                });
            } finally {
                process.env.XDG_CONFIG_HOME = original;
            }
        });
    });
});
