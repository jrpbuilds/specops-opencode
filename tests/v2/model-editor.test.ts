import type { Plugin } from "@opencode-ai/plugin/tui";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import { AGENT_IDS } from "../../src/agents/ids.js";
import { DEFAULT_CONFIG, loadConfig, saveConfig } from "../../src/config.js";
import { showModelEditor } from "../../src/tui/model-editor.js";

type FakeOptions = {
    providers?: Array<{ id: string; name: string }>;
    models?: Array<{
        id: string;
        providerID: string;
        name: string;
        enabled: boolean;
        variants: Array<{ id: string }>;
    }>;
    selections?: unknown[];
    confirmations?: boolean[];
};

async function withConfigHome(run: () => Promise<void>): Promise<void> {
    const directory = await mkdtemp(path.join(os.tmpdir(), "specops-v2-tui-"));
    const previous = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = directory;
    try {
        await run();
    } finally {
        if (previous === undefined) delete process.env.XDG_CONFIG_HOME;
        else process.env.XDG_CONFIG_HOME = previous;
        await rm(directory, { recursive: true, force: true });
    }
}

function fakeContext(options: FakeOptions = {}) {
    const providers = options.providers ?? [{ id: "openai", name: "OpenAI" }];
    const models =
        options.models ??
        [
            {
                id: "gpt-5.6",
                providerID: "openai",
                name: "GPT-5.6",
                enabled: true,
                variants: [{ id: "medium" }, { id: "high" }],
            },
        ];
    const selections = [...(options.selections ?? [])];
    const confirmations = [...(options.confirmations ?? [])];
    const selectCalls: any[] = [];
    const alerts: any[] = [];
    const toasts: any[] = [];
    let providerSyncs = 0;
    let modelSyncs = 0;

    const ctx = {
        location: { directory: "/project" },
        data: {
            location: {
                provider: {
                    sync: async () => {
                        providerSyncs += 1;
                    },
                    list: () => providers,
                },
                model: {
                    sync: async () => {
                        modelSyncs += 1;
                    },
                    list: () => models,
                },
            },
        },
        ui: {
            dialog: {
                select: async (input: unknown) => {
                    selectCalls.push(input);
                    return selections.shift();
                },
                alert: async (input: unknown) => {
                    alerts.push(input);
                },
                confirm: async () => confirmations.shift() ?? false,
            },
            toast: {
                show: (input: unknown) => {
                    toasts.push(input);
                },
            },
        },
    } as unknown as Plugin.Context;

    return {
        ctx,
        selectCalls,
        alerts,
        toasts,
        syncCounts: () => ({ provider: providerSyncs, model: modelSyncs }),
    };
}

describe("OpenCode 2 model editor", () => {
    test("reports an empty OpenCode model catalogue without opening a dialog", async () => {
        await withConfigHome(async () => {
            const host = fakeContext({ providers: [], models: [] });
            await showModelEditor(host.ctx);

            expect(host.syncCounts()).toEqual({ provider: 1, model: 1 });
            expect(host.selectCalls).toHaveLength(0);
            expect(host.toasts).toEqual([
                {
                    variant: "error",
                    title: "SpecOps model settings",
                    message: "OpenCode has no configured models to select.",
                },
            ]);
        });
    });

    test("can cancel without writing configuration", async () => {
        await withConfigHome(async () => {
            const host = fakeContext({ selections: ["__cancel__"] });
            await showModelEditor(host.ctx);
            expect(host.selectCalls).toHaveLength(1);
            expect(host.toasts).toHaveLength(0);
            expect(await loadConfig()).toEqual(DEFAULT_CONFIG);
        });
    });

    test("persists a selected model and variant after review", async () => {
        await withConfigHome(async () => {
            const host = fakeContext({
                selections: [
                    AGENT_IDS.planner,
                    "openai/gpt-5.6",
                    "high",
                    "__review__",
                ],
                confirmations: [true],
            });

            await showModelEditor(host.ctx);

            const saved = await loadConfig();
            expect(saved.agents[AGENT_IDS.planner]).toEqual({
                model: "openai/gpt-5.6",
                variant: "high",
            });
            expect(host.toasts.at(-1)).toMatchObject({
                variant: "success",
                title: "SpecOps configuration saved",
            });
        });
    });

    test("can return a configured role to the OpenCode default", async () => {
        await withConfigHome(async () => {
            const source = structuredClone(DEFAULT_CONFIG);
            source.agents[AGENT_IDS.planner] = {
                model: "openai/gpt-5.6",
                variant: "high",
            };
            await saveConfig(source);

            const host = fakeContext({
                selections: [AGENT_IDS.planner, "__default_model__", "__review__"],
                confirmations: [true],
            });
            await showModelEditor(host.ctx);

            expect((await loadConfig()).agents[AGENT_IDS.planner]).toEqual({});
        });
    });

    test("persists Frontier and concurrency options together", async () => {
        await withConfigHome(async () => {
            const host = fakeContext({
                selections: [
                    "__frontier_escalation__",
                    "__concurrent_subagents__",
                    4,
                    "__review__",
                ],
                confirmations: [true],
            });

            await showModelEditor(host.ctx);

            const saved = await loadConfig();
            expect(saved.frontierEscalation).toBe(true);
            expect(saved.maxSubagentConcurrency).toBe(4);
        });
    });

    test("shows validation errors for stale saved models and lets the user back out", async () => {
        await withConfigHome(async () => {
            const source = structuredClone(DEFAULT_CONFIG);
            source.agents[AGENT_IDS.planner] = { model: "missing/model" };
            await saveConfig(source);

            const host = fakeContext({ selections: ["__review__", "__cancel__"] });
            await showModelEditor(host.ctx);

            expect(host.alerts).toHaveLength(1);
            expect(host.alerts[0]).toMatchObject({
                title: "SpecOps configuration needs attention",
            });
            expect(String(host.alerts[0].message)).toContain(
                `${AGENT_IDS.planner}: model missing/model is not currently configured`,
            );
            expect((await loadConfig()).agents[AGENT_IDS.planner]).toEqual({
                model: "missing/model",
            });
        });
    });

    test("filters disabled models and sorts choices by provider then model name", async () => {
        await withConfigHome(async () => {
            const host = fakeContext({
                providers: [
                    { id: "zeta", name: "Zeta" },
                    { id: "alpha", name: "Alpha" },
                ],
                models: [
                    {
                        id: "z-model",
                        providerID: "zeta",
                        name: "Zulu",
                        enabled: true,
                        variants: [],
                    },
                    {
                        id: "disabled",
                        providerID: "alpha",
                        name: "Disabled",
                        enabled: false,
                        variants: [],
                    },
                    {
                        id: "a-model",
                        providerID: "alpha",
                        name: "Able",
                        enabled: true,
                        variants: [],
                    },
                ],
                selections: [AGENT_IDS.planner, "__default_model__", "__cancel__"],
            });

            await showModelEditor(host.ctx);

            const modelDialog = host.selectCalls[1] as {
                options: Array<{ title: string; value: string; category?: string }>;
            };
            expect(modelDialog.options.map(option => option.value)).toEqual([
                "__default_model__",
                "alpha/a-model",
                "zeta/z-model",
            ]);
            expect(modelDialog.options.map(option => option.category)).toEqual([
                "Default",
                "Alpha",
                "Zeta",
            ]);
        });
    });

    test("clears an old variant when the selected model has no variants", async () => {
        await withConfigHome(async () => {
            const source = structuredClone(DEFAULT_CONFIG);
            source.agents[AGENT_IDS.planner] = {
                model: "openai/old",
                variant: "high",
            };
            await saveConfig(source);

            const host = fakeContext({
                models: [
                    {
                        id: "plain",
                        providerID: "openai",
                        name: "Plain",
                        enabled: true,
                        variants: [],
                    },
                ],
                selections: [AGENT_IDS.planner, "openai/plain", "__review__"],
                confirmations: [true],
            });

            await showModelEditor(host.ctx);

            expect((await loadConfig()).agents[AGENT_IDS.planner]).toEqual({
                model: "openai/plain",
            });
        });
    });

    test("returns to editing when review confirmation is declined", async () => {
        await withConfigHome(async () => {
            const host = fakeContext({
                selections: ["__review__", "__cancel__"],
                confirmations: [false],
            });

            await showModelEditor(host.ctx);

            expect(host.selectCalls).toHaveLength(2);
            expect(host.toasts).toHaveLength(0);
        });
    });
});
