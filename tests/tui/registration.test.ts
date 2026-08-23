import { describe, expect, test } from "bun:test";
import { ALL_AGENT_IDS } from "../../src/agents/ids.js";
import { registerModelSettings } from "../../src/tui/index.js";
import { allProviders } from "../fixtures.js";
import { fakeTuiApi, withConfigHome } from "./helpers.js";
import { withTempDir } from "../helpers.js";

describe("registerModelSettings", () => {
    test("registers the SpecOps Configure palette command", () => {
        const fake = fakeTuiApi(allProviders);
        registerModelSettings(fake.api);

        expect(fake.commands).toHaveLength(1);
        expect(fake.commands[0]).toMatchObject({
            name: "specops.models.configure",
            title: "SpecOps Configure",
            namespace: "palette",
            category: "SpecOps",
        });
        expect(fake.commands[0].run).toBeFunction();
    });

    test("opens a role list with all seven roles and actions", async () =>
        withTempDir(async home =>
            withConfigHome(home, async () => {
                const fake = fakeTuiApi(allProviders);
                registerModelSettings(fake.api);

                await fake.runCommand();
                const props = fake.currentDialog();
                const options = props?.options ?? [];
                const values = options.map(option => option.value);

                expect(values).toEqual([
                    ...ALL_AGENT_IDS,
                    "__frontier_escalation__",
                    "__concurrent_subagents__",
                    "__save__",
                    "__cancel__",
                ]);
                expect(
                    options.slice(0, 7).map(option => option.title.replace(/^[!*] /, "")),
                ).toEqual([
                    "Coordinator",
                    "Explorer",
                    "Planner",
                    "Designer",
                    "Implementer",
                    "Reviewer",
                    "Frontier",
                ]);
                expect(
                    options.slice(0, 7).every(option => option.category === "Model Routing"),
                ).toBe(true);
                expect(props?.title).toBe("SpecOps role model mappings");
            }),
        ));

    test("does not open a second editor while one is already open", async () =>
        withTempDir(async home =>
            withConfigHome(home, async () => {
                const fake = fakeTuiApi(allProviders);
                registerModelSettings(fake.api);

                await fake.runCommand();
                const replaceCount = fake.replaceCount;
                await fake.runCommand();

                expect(fake.replaceCount).toBe(replaceCount);
            }),
        ));

    test("reports an error when OpenCode has no configured models", async () => {
        await withTempDir(async home =>
            withConfigHome(home, async () => {
                const fake = fakeTuiApi([]);
                registerModelSettings(fake.api);

                await fake.runCommand();

                expect(fake.toasts).toEqual([
                    {
                        variant: "error",
                        title: "SpecOps model settings",
                        message: "OpenCode has no configured models to select.",
                    },
                ]);
                expect(fake.currentDialog()).toBeUndefined();
            }),
        );
    });

    test("unregisters the palette command on dispose", () => {
        const fake = fakeTuiApi(allProviders);
        registerModelSettings(fake.api);
        expect(fake.isCommandRegistered).toBe(true);

        fake.dispose();

        expect(fake.isCommandRegistered).toBe(false);
    });

    test("toasts an error and releases the open guard when the editor fails", async () =>
        withTempDir(async home =>
            withConfigHome(home, async () => {
                const fake = fakeTuiApi(allProviders);
                Object.defineProperty(fake.api, "state", {
                    get(): unknown {
                        throw new Error("provider catalogue unavailable");
                    },
                });
                registerModelSettings(fake.api);

                await fake.runCommand();
                await fake.runCommand();

                const errors = fake.toasts.filter(toast => toast.variant === "error");
                expect(errors).toHaveLength(2);
                expect(errors[0]).toMatchObject({
                    title: "SpecOps model settings",
                    message: "provider catalogue unavailable",
                });
                expect(fake.currentDialog()).toBeUndefined();
            }),
        ));
});
