import type { Plugin } from "@opencode-ai/plugin/tui";
import { describe, expect, test } from "bun:test";
import TuiPlugin from "../../src/tui/index.js";
import { registerModelSettings } from "../../src/tui/registration.js";

describe("OpenCode 2 TUI contract", () => {
    test("exports a native V2 TUI definition", () => {
        expect(TuiPlugin.id).toBe("specops");
        expect(typeof TuiPlugin.setup).toBe("function");
    });

    test("registers the SpecOps Configure palette command", () => {
        let layer: any;
        const ctx = {
            keymap: {
                layer(factory: () => unknown) {
                    layer = factory();
                    return { dispose() {} };
                },
            },
        } as unknown as Plugin.Context;

        registerModelSettings(ctx);

        expect(layer.commands).toHaveLength(1);
        expect(layer.commands[0]).toMatchObject({
            id: "specops.models.configure",
            title: "SpecOps Configure",
            group: "SpecOps",
            palette: true,
        });
        expect(layer.commands[0].enabled()).toBe(true);
        expect(typeof layer.commands[0].run).toBe("function");
    });
});
