import { describe, expect, test } from "bun:test";
import SpecOpsTuiPlugin from "../../src/tui/index.js";
import { allProviders } from "../fixtures.js";
import { fakeTuiApi } from "./helpers.js";

describe("SpecOpsTuiPlugin", () => {
    test("exposes the specops plugin identity and TUI factory", () => {
        expect(SpecOpsTuiPlugin.id).toBe("specops");
        expect(SpecOpsTuiPlugin.tui).toBeFunction();
    });

    test("registers the SpecOps Configure command when loaded by OpenCode", async () => {
        const fake = fakeTuiApi(allProviders);

        await SpecOpsTuiPlugin.tui(fake.api);

        expect(fake.commands).toHaveLength(1);
        expect(fake.commands[0]).toMatchObject({
            name: "specops.models.configure",
            namespace: "palette",
            category: "SpecOps",
        });
        expect(fake.isCommandRegistered).toBe(true);
    });

    test("removes the palette command when the TUI plugin is disposed", async () => {
        const fake = fakeTuiApi(allProviders);
        await SpecOpsTuiPlugin.tui(fake.api);

        fake.dispose();

        expect(fake.isCommandRegistered).toBe(false);
    });
});
