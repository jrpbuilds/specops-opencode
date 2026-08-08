import type { Config } from "@opencode-ai/plugin";
import { describe, expect, test } from "bun:test";
import { COMMANDS, SpecOpsPlugin } from "../src/index.js";

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

    test("registers the specops_onboard tool", async () => {
        const hooks = await SpecOpsPlugin(pluginInput());
        expect(Object.keys(hooks.tool ?? {})).toEqual(["specops_onboard"]);
    });
});
