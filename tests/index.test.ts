import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { PluginInput } from "@opencode-ai/plugin";
import * as configModule from "../src/config.js";
import { SpecOpsPlugin } from "../src/index.js";

afterEach(() => {
    mock.restore();
});

function pluginInput(): PluginInput {
    return {
        directory: "/project",
        worktree: "/project",
        project: {} as PluginInput["project"],
        client: {} as PluginInput["client"],
        serverUrl: new URL("http://127.0.0.1"),
        $: {} as PluginInput["$"],
        experimental_workspace: { register() {} },
    };
}

describe("SpecOpsPlugin config hook", () => {
    test("warns and continues when configuration loading fails", async () => {
        const warnSpy = spyOn(console, "warn").mockImplementation(() => undefined);
        spyOn(configModule, "loadConfig").mockRejectedValue(new Error("configuration is broken"));

        const plugin = await SpecOpsPlugin(pluginInput());
        expect(plugin.config).toBeDefined();
        const config: Record<string, unknown> = {};
        await plugin.config?.(config);

        expect(config.command).toEqual(
            expect.objectContaining({
                specops: expect.any(Object),
                "specops-auto": expect.any(Object),
                "specops-doctor": expect.any(Object),
                "specops-onboard": expect.any(Object),
            }),
        );
        expect(warnSpy).toHaveBeenCalledWith(
            "SpecOps: failed to load configuration, agent registration skipped:",
            "configuration is broken",
        );
    });
});
