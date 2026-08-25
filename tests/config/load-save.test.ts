import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import { ALL_AGENT_IDS } from "../../src/agents/ids.js";
import { DEFAULT_CONFIG, loadConfig, saveConfig } from "../../src/config.js";
import { configPath, withTempDir } from "../helpers.js";

/**
 * Build the fully-populated configuration example used by round-trip tests.
 *
 * Each role receives an explicit model and variant so serialization covers the
 * maximum persisted shape rather than only the default empty entries.
 */
function fullyPopulated() {
    const agents = structuredClone(DEFAULT_CONFIG.agents);
    agents["specops-coordinator"] = {
        model: "opencode-go/minimax-m3",
        variant: "thinking",
    };
    agents["specops-explorer"] = {
        model: "openference/Qwen3.7 Plus",
        variant: "medium",
    };
    agents["specops-planner"] = {
        model: "openference/GLM-5.2",
        variant: "high",
    };
    agents["specops-designer"] = {
        model: "openference/DeepSeek-V4-Pro",
        variant: "high",
    };
    agents["specops-implementer"] = {
        model: "openference/Kimi K2.7 Code",
        variant: "thinking",
    };
    agents["specops-review-correctness"] = {
        model: "openai/gpt-5.6-terra",
    };
    agents["specops-review-risk"] = {};
    agents["specops-review-quality"] = {
        model: "openai/gpt-5.6-sol",
        variant: "high",
    };
    agents["specops-reviewer"] = {
        model: "openai/gpt-5.6-terra",
        variant: "high",
    };
    agents["specops-frontier"] = {
        model: "openai/gpt-5.6-sol",
        variant: "high",
    };
    return {
        agents,
        frontierEscalation: true,
        maxSubagentConcurrency: 12,
        maxAutoReviewIterations: 14,
    };
}

describe("loadConfig", () => {
    test("returns DEFAULT_CONFIG with every catalogue role when the file is missing", async () => {
        await withTempDir(async dir => {
            const config = await loadConfig(configPath(dir));
            expect(config).toEqual(DEFAULT_CONFIG);
            expect(Object.keys(config.agents)).toEqual([...ALL_AGENT_IDS]);
        });
    });

    test("throws on invalid JSON instead of falling back to defaults", async () => {
        await withTempDir(async dir => {
            const destination = configPath(dir);
            await writeFile(destination, "{ not valid json", "utf8");
            await expect(loadConfig(destination)).rejects.toThrow();
        });
    });

    test("throws on an unknown role id", async () => {
        await withTempDir(async dir => {
            const destination = configPath(dir);
            await writeFile(
                destination,
                JSON.stringify({ agents: { "specops-architect": {} } }),
                "utf8",
            );
            await expect(loadConfig(destination)).rejects.toThrow();
        });
    });

    test("returns validated config from a valid file", async () => {
        await withTempDir(async dir => {
            const destination = configPath(dir);
            const expected = fullyPopulated();
            await saveConfig(expected, destination);
            expect(await loadConfig(destination)).toEqual(expected);
        });
    });

    test("loads an older config without review specialists as inheriting entries", async () => {
        await withTempDir(async dir => {
            const destination = configPath(dir);
            const agents: Record<string, unknown> = structuredClone(DEFAULT_CONFIG.agents);
            delete agents["specops-review-correctness"];
            delete agents["specops-review-risk"];
            delete agents["specops-review-quality"];
            await writeFile(
                destination,
                JSON.stringify({ agents, frontierEscalation: false }),
                "utf8",
            );

            const loaded = await loadConfig(destination);
            expect(loaded.agents["specops-review-correctness"]).toEqual({});
            expect(loaded.agents["specops-review-risk"]).toEqual({});
            expect(loaded.agents["specops-review-quality"]).toEqual({});

            await saveConfig(loaded, destination);
            expect(await loadConfig(destination)).toEqual(DEFAULT_CONFIG);
        });
    });

    test("loads an older config without frontier escalation as disabled", async () => {
        await withTempDir(async dir => {
            const destination = configPath(dir);
            await writeFile(destination, JSON.stringify({ agents: DEFAULT_CONFIG.agents }), "utf8");
            expect(await loadConfig(destination)).toEqual(DEFAULT_CONFIG);
        });
    });

    test("loads an older config without concurrency as serial", async () => {
        await withTempDir(async dir => {
            const destination = configPath(dir);
            await writeFile(
                destination,
                JSON.stringify({ agents: DEFAULT_CONFIG.agents, frontierEscalation: false }),
                "utf8",
            );
            expect((await loadConfig(destination)).maxSubagentConcurrency).toBe(1);
            expect((await loadConfig(destination)).maxAutoReviewIterations).toBe(3);
        });
    });
});

describe("saveConfig", () => {
    test("writes pretty JSON with a trailing newline", async () => {
        await withTempDir(async dir => {
            const destination = configPath(dir);
            const config = structuredClone(DEFAULT_CONFIG);
            config.agents["specops-coordinator"] = {
                model: "openference/GLM-5.2",
                variant: "high",
            };

            await saveConfig(config, destination);
            const onDisk = await readFile(destination, "utf8");
            expect(onDisk).toEndWith("\n");
            expect(JSON.parse(onDisk)).toEqual(config);
        });
    });

    test("creates nested parent directories", async () => {
        await withTempDir(async dir => {
            const destination = path.join(dir, "deeply", "nested", "specops.json");
            await saveConfig(structuredClone(DEFAULT_CONFIG), destination);
            expect(await readFile(destination, "utf8")).toBeTruthy();
        });
    });

    test("validates before writing: invalid input throws and no file is created", async () => {
        await withTempDir(async dir => {
            const destination = configPath(dir);
            const broken = { agents: { "specops-architect": {} } } as never;
            await expect(saveConfig(broken, destination)).rejects.toThrow();
            await expect(readFile(destination, "utf8")).rejects.toThrow();
        });
    });

    test("atomically overwrites an existing file", async () => {
        await withTempDir(async dir => {
            const destination = configPath(dir);
            const first = structuredClone(DEFAULT_CONFIG);
            first.agents["specops-explorer"] = { model: "openference/GLM-5.2" };
            await saveConfig(first, destination);

            const second = structuredClone(DEFAULT_CONFIG);
            second.agents["specops-explorer"] = {
                model: "openference/Qwen3.7 Plus",
                variant: "high",
            };
            await saveConfig(second, destination);

            expect(await loadConfig(destination)).toEqual(second);
        });
    });

    test("round-trips the fully-populated spec example", async () => {
        await withTempDir(async dir => {
            const destination = configPath(dir);
            const config = fullyPopulated();
            await saveConfig(config, destination);
            expect(await loadConfig(destination)).toEqual(config);
        });
    });

    test("round-trips a partial model-only configuration", async () => {
        await withTempDir(async dir => {
            const destination = configPath(dir);
            const config = structuredClone(DEFAULT_CONFIG);
            config.agents["specops-implementer"] = {
                model: "openference/Kimi K2.7 Code",
            };
            await saveConfig(config, destination);
            expect(await loadConfig(destination)).toEqual(config);
        });
    });

    test("round-trips explicit and unset review specialist mappings", async () => {
        await withTempDir(async dir => {
            const destination = configPath(dir);
            const config = structuredClone(DEFAULT_CONFIG);
            config.agents["specops-review-correctness"] = {
                model: "openference/GLM-5.2",
                variant: "high",
            };
            config.agents["specops-review-risk"] = {};

            await saveConfig(config, destination);
            const loaded = await loadConfig(destination);

            expect(loaded.agents["specops-review-correctness"]).toEqual({
                model: "openference/GLM-5.2",
                variant: "high",
            });
            expect(loaded.agents["specops-review-risk"]).toEqual({});
        });
    });

    test("round-trips DEFAULT_CONFIG through save and load", async () => {
        await withTempDir(async dir => {
            const destination = configPath(dir);
            await saveConfig(structuredClone(DEFAULT_CONFIG), destination);
            expect(await loadConfig(destination)).toEqual(DEFAULT_CONFIG);
        });
    });

    test("persists an explicit disabled frontier escalation value", async () => {
        await withTempDir(async dir => {
            const destination = configPath(dir);
            const config = structuredClone(DEFAULT_CONFIG);
            config.frontierEscalation = false;
            await saveConfig(config, destination);
            expect(JSON.parse(await readFile(destination, "utf8")).frontierEscalation).toBe(false);
        });
    });
});
