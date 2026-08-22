import type { Config } from "@opencode-ai/plugin";
import { describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
    buildCoordinatorPrompt,
    SPECOPS_AGENT_ID,
    SPECOPS_AUTO_AGENT_ID,
} from "../src/agents/coordinator.js";
import { DESIGNER_AGENT_ID } from "../src/agents/designer.js";
import { EXPLORER_AGENT_ID } from "../src/agents/explorer.js";
import { FRONTIER_AGENT_ID } from "../src/agents/frontier.js";
import { IMPLEMENTER_AGENT_ID } from "../src/agents/implementer.js";
import { AGENT_IDS } from "../src/agents/ids.js";
import {
    DESIGNER_PERMISSION,
    EXPLORER_PERMISSION,
    IMPLEMENTER_PERMISSION,
    PLANNER_PERMISSION,
    REVIEWER_PERMISSION,
} from "../src/agents/permissions.js";
import { PLANNER_AGENT_ID } from "../src/agents/planner.js";
import { REVIEWER_AGENT_ID } from "../src/agents/reviewer.js";
import { DEFAULT_CONFIG } from "../src/config.js";
import { COMMANDS, SpecOpsPlugin } from "../src/index.js";
import { loadPrompt } from "../src/prompts.js";
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

async function writeSpecOpsConfig(dir: string, config: object): Promise<void> {
    const configDir = path.join(dir, "opencode");
    await mkdir(configDir, { recursive: true });
    await writeFile(path.join(configDir, "specops.json"), `${JSON.stringify(config, null, 2)}\n`);
}

async function loadPluginConfig(dir: string, persistedConfig?: object): Promise<Config> {
    if (persistedConfig) await writeSpecOpsConfig(dir, persistedConfig);

    const hooks = await SpecOpsPlugin(pluginInput());
    const config: Config = {};
    await hooks.config?.(config);
    return config;
}

describe("SpecOps server plugin", () => {
    test("registers the command and tool catalogues", async () => {
        await withTempDir(async dir => {
            const original = process.env.XDG_CONFIG_HOME;
            process.env.XDG_CONFIG_HOME = dir;
            try {
                const hooks = await SpecOpsPlugin(pluginInput());
                const config: Config = {};
                await hooks.config?.(config);

                expect(Object.keys(config.command ?? {}).sort()).toEqual([
                    "specops",
                    "specops-auto",
                    "specops-doctor",
                    "specops-onboard",
                    "specops-sync",
                    "specops-update",
                ]);
                expect(config.command).toEqual(COMMANDS);
                expect(config.command?.specops).toEqual({
                    description: "Run a goal under the SpecOps coordinator",
                    agent: SPECOPS_AGENT_ID,
                    template: "$ARGUMENTS",
                });
                expect(config.command?.["specops-auto"]).toEqual({
                    description:
                        "Run a goal under the SpecOps Auto coordinator (autonomous, no human checkpoints)",
                    agent: SPECOPS_AUTO_AGENT_ID,
                    template: "$ARGUMENTS",
                });
                expect(config.command?.["specops-update"]).toEqual({
                    description: "Revise an active SpecOps change's planning artifacts in place",
                    agent: SPECOPS_AGENT_ID,
                    template: "$ARGUMENTS",
                });
                expect(config.command?.["specops-sync"]).toEqual({
                    description:
                        "Synchronize an active SpecOps change's delta specs into main specs without archiving it.",
                    agent: SPECOPS_AGENT_ID,
                    template: "$ARGUMENTS",
                });
                expect(Object.keys(hooks.tool ?? {}).sort()).toEqual([
                    "specops_archive",
                    "specops_context",
                    "specops_create_change",
                    "specops_doctor",
                    "specops_onboard",
                    "specops_status",
                    "specops_validate_change",
                ]);
            } finally {
                process.env.XDG_CONFIG_HOME = original;
            }
        });
    });

    test("registers coordinator modes and specialist prompts with expected permissions", async () => {
        await withTempDir(async dir => {
            const original = process.env.XDG_CONFIG_HOME;
            process.env.XDG_CONFIG_HOME = dir;
            try {
                const config = await loadPluginConfig(dir);

                expect(config.agent?.[SPECOPS_AGENT_ID]).toMatchObject({
                    description: "SpecOps coordinator for spec-driven development",
                    mode: "primary",
                    prompt: buildCoordinatorPrompt("interactive", false),
                });
                expect(config.agent?.[SPECOPS_AUTO_AGENT_ID]).toMatchObject({
                    mode: "primary",
                    prompt: buildCoordinatorPrompt("auto", false),
                });
                expect(
                    (config.agent?.[SPECOPS_AGENT_ID]?.permission as { question?: string })
                        ?.question,
                ).toBe("allow");
                expect(
                    (config.agent?.[SPECOPS_AUTO_AGENT_ID]?.permission as { question?: string })
                        ?.question,
                ).toBe("deny");

                expect(config.agent?.[EXPLORER_AGENT_ID] as Record<string, unknown>).toEqual({
                    description:
                        "Investigates repository source, behavior, conventions, tests, constraints, and risks for planning and design. Use when the SpecOps coordinator needs focused repository evidence.",
                    mode: "subagent",
                    hidden: true,
                    permission: EXPLORER_PERMISSION,
                    prompt: loadPrompt(AGENT_IDS.explorer),
                });
                expect(config.agent?.[PLANNER_AGENT_ID] as Record<string, unknown>).toEqual({
                    description:
                        "Authors OpenSpec planning artifacts — proposals, capability specifications, and implementation tasks — from the user's goal and repository evidence. Use this agent for SpecOps planning artifacts.",
                    mode: "subagent",
                    hidden: true,
                    permission: PLANNER_PERMISSION,
                    prompt: loadPrompt(AGENT_IDS.planner),
                });
                expect(config.agent?.[DESIGNER_AGENT_ID] as Record<string, unknown>).toEqual({
                    description:
                        "Authors the technical OpenSpec design from approved requirements and repository evidence. Use this agent to create design.md for SpecOps changes.",
                    mode: "subagent",
                    hidden: true,
                    permission: DESIGNER_PERMISSION,
                    prompt: loadPrompt(AGENT_IDS.designer),
                });
                expect(config.agent?.[IMPLEMENTER_AGENT_ID] as Record<string, unknown>).toEqual({
                    description:
                        "Implements approved OpenSpec tasks in source and tests, runs verification, and marks completed tasks in tasks.md. Use this agent to execute SpecOps implementation plans.",
                    mode: "subagent",
                    hidden: true,
                    prompt: loadPrompt(AGENT_IDS.implementer),
                    permission: IMPLEMENTER_PERMISSION,
                });
                expect(config.agent?.[REVIEWER_AGENT_ID] as Record<string, unknown>).toEqual({
                    description:
                        "Independently verifies implemented OpenSpec changes against requirements, design, tasks, source code, and tests. Use this agent as the final SpecOps quality gate before completion.",
                    mode: "subagent",
                    hidden: true,
                    prompt: loadPrompt(AGENT_IDS.reviewer),
                    permission: REVIEWER_PERMISSION,
                });
            } finally {
                process.env.XDG_CONFIG_HOME = original;
            }
        });
    });

    test("keeps Frontier absent and its coordinator policy unloaded when disabled", async () => {
        await withTempDir(async dir => {
            const original = process.env.XDG_CONFIG_HOME;
            process.env.XDG_CONFIG_HOME = dir;
            try {
                const config = await loadPluginConfig(dir, DEFAULT_CONFIG);
                expect(config.agent?.[FRONTIER_AGENT_ID]).toBeUndefined();
                expect(config.agent?.[SPECOPS_AGENT_ID]?.prompt as string).not.toContain(
                    "Frontier escalation is enabled for this session",
                );
                expect(config.agent?.[SPECOPS_AUTO_AGENT_ID]?.prompt as string).not.toContain(
                    "Frontier escalation is enabled for this session",
                );
            } finally {
                process.env.XDG_CONFIG_HOME = original;
            }
        });
    });

    test("registers Frontier and loads its coordinator policy when enabled", async () => {
        await withTempDir(async dir => {
            const original = process.env.XDG_CONFIG_HOME;
            process.env.XDG_CONFIG_HOME = dir;
            try {
                const config = await loadPluginConfig(dir, {
                    ...DEFAULT_CONFIG,
                    frontierEscalation: true,
                });

                expect(config.agent?.[FRONTIER_AGENT_ID]).toMatchObject({
                    description:
                        "Advice-only consultation for genuinely difficult unresolved technical " +
                        "blockers raised by SpecOps specialists. Returns technical advice only; does " +
                        "not modify source, OpenSpec artifacts, tasks, workflow state, review " +
                        "verdicts, or lifecycle state.",
                    mode: "subagent",
                    prompt: loadPrompt(AGENT_IDS.frontier),
                });
                expect(config.agent?.[SPECOPS_AGENT_ID]?.prompt).toBe(
                    buildCoordinatorPrompt("interactive", true),
                );
                expect(config.agent?.[SPECOPS_AUTO_AGENT_ID]?.prompt).toBe(
                    buildCoordinatorPrompt("auto", true),
                );
            } finally {
                process.env.XDG_CONFIG_HOME = original;
            }
        });
    });

    test("Frontier applies configured model and variant when enabled", async () => {
        await withTempDir(async dir => {
            const original = process.env.XDG_CONFIG_HOME;
            process.env.XDG_CONFIG_HOME = dir;
            try {
                const config = await loadPluginConfig(dir, {
                    ...DEFAULT_CONFIG,
                    frontierEscalation: true,
                    agents: {
                        ...DEFAULT_CONFIG.agents,
                        [AGENT_IDS.frontier]: { model: "openference/GLM-5.2", variant: "high" },
                    },
                });

                expect(config.agent?.[FRONTIER_AGENT_ID]).toMatchObject({
                    model: "openference/GLM-5.2",
                    variant: "high",
                });
            } finally {
                process.env.XDG_CONFIG_HOME = original;
            }
        });
    });

    test("Frontier supports blank model fallback when enabled", async () => {
        await withTempDir(async dir => {
            const original = process.env.XDG_CONFIG_HOME;
            process.env.XDG_CONFIG_HOME = dir;
            try {
                const config = await loadPluginConfig(dir, {
                    ...DEFAULT_CONFIG,
                    frontierEscalation: true,
                    agents: {
                        ...DEFAULT_CONFIG.agents,
                        [AGENT_IDS.frontier]: { model: "   ", variant: "high" },
                    },
                });

                expect(config.agent?.[FRONTIER_AGENT_ID]).toBeDefined();
                expect(config.agent?.[FRONTIER_AGENT_ID]?.model).toBeUndefined();
                expect(config.agent?.[FRONTIER_AGENT_ID]?.variant).toBeUndefined();
            } finally {
                process.env.XDG_CONFIG_HOME = original;
            }
        });
    });

    test("separate plugin loads reflect independent Frontier settings", async () => {
        await withTempDir(async dir => {
            const original = process.env.XDG_CONFIG_HOME;
            process.env.XDG_CONFIG_HOME = dir;
            try {
                const disabledConfig = await loadPluginConfig(dir, DEFAULT_CONFIG);
                await writeSpecOpsConfig(dir, { ...DEFAULT_CONFIG, frontierEscalation: true });
                const enabledHooks = await SpecOpsPlugin(pluginInput());
                const enabledConfig: Config = {};
                await enabledHooks.config?.(enabledConfig);

                expect(disabledConfig.agent?.[FRONTIER_AGENT_ID]).toBeUndefined();
                expect(enabledConfig.agent?.[FRONTIER_AGENT_ID]).toBeDefined();
                const enabledOnly = Object.keys(enabledConfig.agent ?? {}).filter(
                    id => !(id in (disabledConfig.agent ?? {})),
                );
                expect(enabledOnly).toEqual([FRONTIER_AGENT_ID]);
            } finally {
                process.env.XDG_CONFIG_HOME = original;
            }
        });
    });
});
