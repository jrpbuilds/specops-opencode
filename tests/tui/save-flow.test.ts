import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import { loadConfig, saveConfig } from "../../src/config.js";
import { allProviders } from "../fixtures.js";
import { withTempDir } from "../helpers.js";
import { fakeTuiApi, withConfigHome } from "./helpers.js";
import { registerModelSettings } from "../../src/tui/index.js";

async function openPlannerModelVariant(fake: ReturnType<typeof fakeTuiApi>): Promise<void> {
    await openRoleModelVariant(fake, "specops-planner");
}

async function openRoleModelVariant(
    fake: ReturnType<typeof fakeTuiApi>,
    id: string,
): Promise<void> {
    await fake.runCommand();
    fake.selectByValue(id);
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

    test("specialist editor accepts explicit mappings and round-trips them", async () => {
        await withTempDir(async home =>
            withConfigHome(home, async () => {
                const fake = fakeTuiApi(allProviders);
                registerModelSettings(fake.api);

                await openRoleModelVariant(fake, "specops-review-correctness");
                expect(
                    fake
                        .currentDialog()
                        ?.options?.find(option => option.value === "specops-review-correctness")
                        ?.title,
                ).toContain("Review - Correctness");
                fake.selectByValue("__save__");
                await fake.confirm();

                const saved = await loadConfig(path.join(home, "opencode", "specops.json"));
                expect(saved.agents["specops-review-correctness"]).toEqual({
                    model: "openference/GLM-5.2",
                    variant: "high",
                });
            }),
        );
    });

    test("persists an unset specialist as an empty Reviewer-inheriting entry", async () => {
        await withTempDir(async home =>
            withConfigHome(home, async () => {
                const fake = fakeTuiApi(allProviders);
                registerModelSettings(fake.api);

                await fake.runCommand();
                fake.selectByValue("specops-review-risk");
                expect(fake.currentDialog()?.title).toBe("specops-review-risk: model");
                fake.selectByValue("");
                fake.selectByValue("__save__");
                await fake.confirm();

                const saved = await loadConfig(path.join(home, "opencode", "specops.json"));
                expect(saved.agents["specops-review-risk"]).toEqual({});
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
                    "specops-review-correctness",
                    "specops-review-risk",
                    "specops-review-quality",
                    "specops-frontier",
                    "__frontier_escalation__",
                    "__concurrent_subagents__",
                    "__auto_review_iterations__",
                    "__implementer_fanout__",
                    "__review_fanout__",
                    "__save__",
                    "__cancel__",
                ]);
                const initialOptions = fake.currentDialog()?.options;
                expect(
                    initialOptions?.find(option => option.value === "__frontier_escalation__"),
                ).toMatchObject({
                    title: "Frontier escalation",
                    category: "Options",
                    footer: "Disabled",
                });
                expect(
                    initialOptions?.find(option => option.value === "__frontier_escalation__")
                        ?.description,
                ).toBeUndefined();
                expect(
                    initialOptions?.find(option => option.value === "__concurrent_subagents__"),
                ).toMatchObject({
                    title: "Concurrent subagents",
                    category: "Options",
                    footer: "1",
                });
                expect(
                    initialOptions?.find(option => option.value === "__concurrent_subagents__")
                        ?.description,
                ).toBeUndefined();
                expect(
                    initialOptions?.find(option => option.value === "__auto_review_iterations__"),
                ).toMatchObject({
                    title: "Auto review iterations",
                    category: "Options",
                    footer: "3",
                });
                expect(initialOptions?.find(option => option.value === "__save__")).toMatchObject({
                    title: "Review and save",
                    category: "Actions",
                    footer: "0 changed",
                });
                expect(
                    initialOptions?.find(option => option.value === "__save__")?.description,
                ).toBe(undefined);
                expect(initialOptions?.find(option => option.value === "__cancel__")).toMatchObject(
                    {
                        title: "Cancel",
                        category: "Actions",
                    },
                );
                expect(
                    initialOptions?.find(option => option.value === "__cancel__")?.description,
                ).toBe(undefined);
                expect(
                    fake.currentDialog()?.options?.find(option => option.value === "__save__")
                        ?.footer,
                ).toBe("0 changed");
                fake.selectByValue("__frontier_escalation__");
                expect(
                    fake
                        .currentDialog()
                        ?.options?.find(option => option.value === "__frontier_escalation__"),
                ).toMatchObject({
                    title: "* Frontier escalation",
                    category: "Options",
                    footer: "Enabled",
                });
                expect(
                    fake
                        .currentDialog()
                        ?.options?.find(option => option.value === "__frontier_escalation__")
                        ?.description,
                ).toBeUndefined();
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

    test("persists the selected concurrent subagent limit as a number", async () => {
        await withTempDir(async home =>
            withConfigHome(home, async () => {
                const fake = fakeTuiApi(allProviders);
                registerModelSettings(fake.api);
                await fake.runCommand();

                fake.selectByValue("__concurrent_subagents__");
                expect(fake.currentDialog()?.title).toBe("Concurrent subagents");
                expect(fake.currentDialog()?.current).toBe(1);
                expect(fake.currentDialog()?.options?.map(option => option.value)).toEqual([
                    1, 2, 3, 4, 5, 6, 7, 8,
                ]);
                expect(fake.currentDialog()?.options?.map(option => option.description)).toEqual([
                    "Up to 1 parallel subagent",
                    "Up to 2 parallel subagents",
                    "Up to 3 parallel subagents",
                    "Up to 4 parallel subagents",
                    "Up to 5 parallel subagents",
                    "Up to 6 parallel subagents",
                    "Up to 7 parallel subagents",
                    "Up to 8 parallel subagents",
                ]);
                fake.selectByValue(5);
                expect(
                    fake
                        .currentDialog()
                        ?.options?.find(option => option.value === "__concurrent_subagents__"),
                ).toMatchObject({
                    title: "* Concurrent subagents",
                    category: "Options",
                    footer: "5",
                });
                expect(
                    fake
                        .currentDialog()
                        ?.options?.find(option => option.value === "__concurrent_subagents__")
                        ?.description,
                ).toBeUndefined();
                fake.selectByValue("__save__");
                await fake.confirm();

                const saved = await loadConfig(path.join(home, "opencode", "specops.json"));
                expect(saved.maxSubagentConcurrency).toBe(5);
                expect(typeof saved.maxSubagentConcurrency).toBe("number");
            }),
        );
    });

    test("persists the selected Auto review iteration budget and shows it in the save review", async () => {
        await withTempDir(async home =>
            withConfigHome(home, async () => {
                const fake = fakeTuiApi(allProviders);
                registerModelSettings(fake.api);
                await fake.runCommand();

                fake.selectByValue("__auto_review_iterations__");
                expect(fake.currentDialog()?.title).toBe("Auto review iterations");
                expect(fake.currentDialog()?.current).toBe(3);
                expect(fake.currentDialog()?.options?.map(option => option.value)).toEqual([
                    1, 2, 3,
                ]);
                expect(fake.currentDialog()?.options?.map(option => option.description)).toEqual([
                    "1 correction/re-review iteration",
                    "2 correction/re-review iterations",
                    "3 correction/re-review iterations",
                ]);

                fake.selectByValue(2);
                fake.selectByValue("__save__");
                expect(fake.currentDialog()?.message).toContain("Auto review iterations: 2.");
                await fake.confirm();

                const saved = await loadConfig(path.join(home, "opencode", "specops.json"));
                expect(saved.maxAutoReviewIterations).toBe(2);
            }),
        );
    });

    test("persists the selected fan-out modes and shows them in the save review", async () => {
        await withTempDir(async home =>
            withConfigHome(home, async () => {
                const fake = fakeTuiApi(allProviders);
                registerModelSettings(fake.api);
                await fake.runCommand();

                fake.selectByValue("__implementer_fanout__");
                expect(fake.currentDialog()?.title).toBe("Implementer fan-out");
                expect(fake.currentDialog()?.current).toBe("auto");
                expect(fake.currentDialog()?.options?.map(option => option.value)).toEqual([
                    "auto",
                    "always",
                    "never",
                ]);
                expect(fake.currentDialog()?.options?.map(option => option.description)).toEqual([
                    "Parallel lanes only for larger, segregated work",
                    "Prefer parallel lanes whenever work is safely segregated",
                    "Always one whole-list implementer",
                ]);
                fake.selectByValue("never");
                expect(
                    fake
                        .currentDialog()
                        ?.options?.find(option => option.value === "__implementer_fanout__"),
                ).toMatchObject({
                    title: "* Implementer fan-out",
                    category: "Options",
                    footer: "never",
                });

                fake.selectByValue("__review_fanout__");
                expect(fake.currentDialog()?.title).toBe("Review fan-out");
                expect(fake.currentDialog()?.current).toBe("auto");
                expect(fake.currentDialog()?.options?.map(option => option.value)).toEqual([
                    "auto",
                    "always",
                    "never",
                ]);
                expect(fake.currentDialog()?.options?.map(option => option.description)).toEqual([
                    "Three critics for larger or riskier changes",
                    "Always run all three review critics",
                    "Always a single final reviewer",
                ]);
                fake.selectByValue("always");

                fake.selectByValue("__save__");
                expect(fake.currentDialog()?.message).toContain("Implementer fan-out: never.");
                expect(fake.currentDialog()?.message).toContain("Review fan-out: always.");
                await fake.confirm();

                const saved = await loadConfig(path.join(home, "opencode", "specops.json"));
                expect(saved.implementerFanout).toBe("never");
                expect(saved.reviewFanout).toBe("always");
            }),
        );
    });

    test("preserves manual budgets above the selectable range during unrelated TUI saves", async () => {
        await withTempDir(async home =>
            withConfigHome(home, async () => {
                const destination = path.join(home, "opencode", "specops.json");
                const persisted = await loadConfig(destination);
                persisted.maxSubagentConcurrency = 12;
                persisted.maxAutoReviewIterations = 14;
                await saveConfig(persisted, destination);

                const fake = fakeTuiApi(allProviders);
                registerModelSettings(fake.api);
                await fake.runCommand();

                expect(
                    fake
                        .currentDialog()
                        ?.options?.find(option => option.value === "__concurrent_subagents__"),
                ).toMatchObject({ footer: "12 (manual)" });
                expect(
                    fake
                        .currentDialog()
                        ?.options?.find(option => option.value === "__auto_review_iterations__"),
                ).toMatchObject({ footer: "14 (manual)" });

                await openPlannerModelVariant(fake);
                fake.selectByValue("__save__");
                await fake.confirm();

                const saved = await loadConfig(destination);
                expect(saved.maxSubagentConcurrency).toBe(12);
                expect(saved.maxAutoReviewIterations).toBe(14);
            }),
        );
    });

    test("explicitly replaces manually configured budgets from the TUI", async () => {
        await withTempDir(async home =>
            withConfigHome(home, async () => {
                const destination = path.join(home, "opencode", "specops.json");
                const persisted = await loadConfig(destination);
                persisted.maxSubagentConcurrency = 12;
                persisted.maxAutoReviewIterations = 14;
                await saveConfig(persisted, destination);

                const fake = fakeTuiApi(allProviders);
                registerModelSettings(fake.api);
                await fake.runCommand();

                fake.selectByValue("__concurrent_subagents__");
                expect(fake.currentDialog()?.title).toBe("Concurrent subagents (manual: 12)");
                expect(fake.currentDialog()?.current).toBe(12);
                fake.selectByValue(4);

                fake.selectByValue("__auto_review_iterations__");
                expect(fake.currentDialog()?.title).toBe("Auto review iterations (manual: 14)");
                expect(fake.currentDialog()?.current).toBe(14);
                fake.selectByValue(2);

                fake.selectByValue("__save__");
                await fake.confirm();

                const saved = await loadConfig(destination);
                expect(saved.maxSubagentConcurrency).toBe(4);
                expect(saved.maxAutoReviewIterations).toBe(2);
            }),
        );
    });

    test("indicates the persisted concurrent subagent limit in the selector", async () => {
        await withTempDir(async home =>
            withConfigHome(home, async () => {
                const destination = path.join(home, "opencode", "specops.json");
                const persisted = await loadConfig(destination);
                persisted.maxSubagentConcurrency = 8;
                await saveConfig(persisted, destination);

                const fake = fakeTuiApi(allProviders);
                registerModelSettings(fake.api);
                await fake.runCommand();

                fake.selectByValue("__concurrent_subagents__");
                expect(fake.currentDialog()).toMatchObject({
                    title: "Concurrent subagents",
                    current: 8,
                });
                expect(fake.currentDialog()?.options?.map(option => option.value)).toEqual([
                    1, 2, 3, 4, 5, 6, 7, 8,
                ]);
            }),
        );
    });

    test("preserves the persisted concurrent limit when saving a model change", async () => {
        await withTempDir(async home =>
            withConfigHome(home, async () => {
                const destination = path.join(home, "opencode", "specops.json");
                const persisted = await loadConfig(destination);
                persisted.maxSubagentConcurrency = 8;
                await saveConfig(persisted, destination);

                const fake = fakeTuiApi(allProviders);
                registerModelSettings(fake.api);
                await openPlannerModelVariant(fake);
                fake.selectByValue("__save__");
                await fake.confirm();

                expect((await loadConfig(destination)).maxSubagentConcurrency).toBe(8);
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

    test("routes stale saved models through the correction alert before saving", async () => {
        await withTempDir(async home =>
            withConfigHome(home, async () => {
                const destination = path.join(home, "opencode", "specops.json");
                const persisted = await loadConfig(destination);
                persisted.agents["specops-planner"] = { model: "gone/stale-model" };
                await saveConfig(persisted, destination);

                const fake = fakeTuiApi(allProviders);
                registerModelSettings(fake.api);
                await fake.runCommand();

                expect(
                    fake
                        .currentDialog()
                        ?.options?.find(option => option.value === "specops-planner")?.title,
                ).toBe("! Planner");

                fake.selectByValue("__save__");
                expect(fake.currentDialog()?.title).toBe("Complete the model mapping");
                expect(fake.currentDialog()?.message).toContain("gone/stale-model");

                await fake.confirm();
                expect(fake.currentDialog()?.title).toBe("SpecOps role model mappings");
                const after = await loadConfig(destination);
                expect(after.agents["specops-planner"]).toEqual({ model: "gone/stale-model" });
            }),
        );
    });

    test("returns from the model picker to the role list via back navigation", async () => {
        await withTempDir(async home =>
            withConfigHome(home, async () => {
                const fake = fakeTuiApi(allProviders);
                registerModelSettings(fake.api);
                await fake.runCommand();

                fake.selectByValue("specops-planner");
                expect(fake.currentDialog()?.title).toBe("specops-planner: model");

                const back = fake
                    .currentDialog()
                    ?.options?.find(option => typeof option.value === "symbol");
                fake.selectByValue(back?.value);

                expect(fake.currentDialog()?.title).toBe("SpecOps role model mappings");
            }),
        );
    });

    test("returns from the variant picker to the model picker via back navigation", async () => {
        await withTempDir(async home =>
            withConfigHome(home, async () => {
                const fake = fakeTuiApi(allProviders);
                registerModelSettings(fake.api);
                await fake.runCommand();

                fake.selectByValue("specops-planner");
                fake.selectByValue("openference/GLM-5.2");
                expect(fake.currentDialog()?.title).toBe("specops-planner: variant");

                const back = fake
                    .currentDialog()
                    ?.options?.find(option => typeof option.value === "symbol");
                fake.selectByValue(back?.value);

                expect(fake.currentDialog()?.title).toBe("specops-planner: model");
            }),
        );
    });
});
