import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import { loadConfig } from "../../src/config.js";
import { allProviders } from "../fixtures.js";
import { withTempDir } from "../helpers.js";
import { fakeTuiApi, withConfigHome } from "./helpers.js";
import { registerModelSettings } from "../../src/tui.js";

async function openPlannerModelVariant(fake: ReturnType<typeof fakeTuiApi>): Promise<void> {
    await fake.runCommand();
    fake.selectByValue("specops-planner");
    fake.selectByValue("openference/GLM-5.2");
    fake.selectByValue("high");
}

describe("SpecOps Configure save flow", () => {
    test("selects a role, model, and variant and persists after confirmation", async () => {
        await withTempDir(async home =>
            withConfigHome(home, async () => {
                const fake = fakeTuiApi(allProviders);
                registerModelSettings(fake.api);

                await openPlannerModelVariant(fake);
                expect(fake.currentDialog()?.options?.[2]?.title).toContain("Planner");

                fake.selectByValue("__save__");
                expect(fake.currentDialog()?.title).toBe("Save SpecOps model mappings?");
                await fake.confirm();

                const destination = path.join(home, "opencode", "specops.json");
                const saved = await loadConfig(destination);
                expect(saved.frontierEscalation).toBe(false);
                expect(saved.agents["specops-planner"]).toEqual({
                    model: "openference/GLM-5.2",
                    variant: "high",
                });
                expect(fake.toasts.at(-1)).toMatchObject({
                    variant: "success",
                    title: "SpecOps model settings saved",
                });
                expect(fake.currentDialog()).toBeUndefined();
            }),
        );
    });

    test("toggles and persists frontier escalation independently of role mappings", async () => {
        await withTempDir(async home =>
            withConfigHome(home, async () => {
                const fake = fakeTuiApi(allProviders);
                registerModelSettings(fake.api);
                await fake.runCommand();

                expect(fake.currentDialog()?.options?.map(option => option.value)).toEqual([
                    "specops-coordinator",
                    "specops-explorer",
                    "specops-planner",
                    "specops-designer",
                    "specops-implementer",
                    "specops-reviewer",
                    "specops-frontier",
                    "__frontier_escalation__",
                    "__save__",
                    "__cancel__",
                ]);
                expect(
                    fake
                        .currentDialog()
                        ?.options?.find(option => option.value === "__frontier_escalation__"),
                ).toMatchObject({ title: "Frontier escalation", footer: "Disabled" });
                expect(
                    fake.currentDialog()?.options?.find(option => option.value === "__save__")
                        ?.footer,
                ).toBe("0 changed");
                fake.selectByValue("__frontier_escalation__");
                expect(
                    fake
                        .currentDialog()
                        ?.options?.find(option => option.value === "__frontier_escalation__"),
                ).toMatchObject({ title: "* Frontier escalation", footer: "Enabled" });
                expect(
                    fake.currentDialog()?.options?.find(option => option.value === "__save__")
                        ?.footer,
                ).toBe("1 changed");
                fake.selectByValue("__save__");
                await fake.confirm();

                const saved = await loadConfig(path.join(home, "opencode", "specops.json"));
                expect(saved.frontierEscalation).toBe(true);
            }),
        );
    });

    test("shows the model and variant navigation options", async () => {
        await withTempDir(async home =>
            withConfigHome(home, async () => {
                const fake = fakeTuiApi(allProviders);
                registerModelSettings(fake.api);
                await fake.runCommand();

                fake.selectByValue("specops-planner");
                expect(fake.currentDialog()?.options?.map(option => option.value)).toContain("");
                expect(fake.currentDialog()?.options?.map(option => option.value)).toContain(
                    "openference/GLM-5.2",
                );
                expect(fake.currentDialog()?.options?.at(-1)?.title).toBe("Back to roles");
            }),
        );
    });

    test("canceling review returns to the role list without saving", async () => {
        await withTempDir(async home =>
            withConfigHome(home, async () => {
                const fake = fakeTuiApi(allProviders);
                registerModelSettings(fake.api);
                await openPlannerModelVariant(fake);
                fake.selectByValue("__save__");
                fake.cancel();

                expect(fake.currentDialog()?.title).toBe("SpecOps role model mappings");
                await expect(
                    readFile(path.join(home, "opencode", "specops.json")),
                ).rejects.toThrow();
            }),
        );
    });

    test("clears the model and variant so the default can be saved", async () => {
        await withTempDir(async home =>
            withConfigHome(home, async () => {
                const fake = fakeTuiApi(allProviders);
                registerModelSettings(fake.api);
                await openPlannerModelVariant(fake);

                fake.selectByValue("specops-planner");
                fake.selectByValue("");
                fake.selectByValue("__save__");

                expect(fake.currentDialog()?.title).toBe("Save SpecOps model mappings?");
                await expect(
                    readFile(path.join(home, "opencode", "specops.json")),
                ).rejects.toThrow();
            }),
        );
    });

    test("toasts save failures and leaves the editor open for retry", async () => {
        await withTempDir(async home =>
            withConfigHome(home, async () => {
                const fake = fakeTuiApi(allProviders);
                registerModelSettings(fake.api);
                await openPlannerModelVariant(fake);
                fake.selectByValue("__save__");

                await mkdir(home, { recursive: true });
                await writeFile(path.join(home, "opencode"), "not a directory", "utf8");
                await fake.confirm();

                expect(fake.toasts.at(-1)).toMatchObject({
                    variant: "error",
                    title: "SpecOps model settings",
                });
                expect(fake.currentDialog()?.title).toBe("SpecOps role model mappings");
            }),
        );
    });
});
