import type { Config } from "@opencode-ai/plugin";
import { describe, expect, test } from "bun:test";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { applyFrontierState, SPECOPS_AGENT_ID } from "../src/agents/coordinator.js";
import { EXPLORER_AGENT_ID } from "../src/agents/explorer.js";
import { PLANNER_AGENT_ID } from "../src/agents/planner.js";
import { DESIGNER_AGENT_ID } from "../src/agents/designer.js";
import { IMPLEMENTER_AGENT_ID } from "../src/agents/implementer.js";
import { REVIEWER_AGENT_ID } from "../src/agents/reviewer.js";
import { FRONTIER_AGENT_ID } from "../src/agents/frontier.js";
import { COMMANDS, SpecOpsPlugin } from "../src/index.js";
import { loadPrompt } from "../src/prompts.js";
import { AGENT_IDS } from "../src/agents/ids.js";
import { DEFAULT_CONFIG } from "../src/config.js";
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

    test("wires the specops command to the SpecOps primary agent", async () => {
        await withTempDir(async dir => {
            const original = process.env.XDG_CONFIG_HOME;
            process.env.XDG_CONFIG_HOME = dir;
            try {
                const hooks = await SpecOpsPlugin(pluginInput());
                const config: Config = {};
                await hooks.config?.(config);

                expect(config.command?.specops).toEqual({
                    description: "Run a goal under the SpecOps coordinator",
                    agent: SPECOPS_AGENT_ID,
                    template: "$ARGUMENTS",
                });
            } finally {
                process.env.XDG_CONFIG_HOME = original;
            }
        });
    });

    test("registers the SpecOps tools", async () => {
        const hooks = await SpecOpsPlugin(pluginInput());
        expect(Object.keys(hooks.tool ?? {}).sort()).toEqual([
            "specops_archive",
            "specops_context",
            "specops_create_change",
            "specops_doctor",
            "specops_onboard",
        ]);
    });

    test("registers the normal SpecOps agents with loaded Markdown prompts", async () => {
        await withTempDir(async dir => {
            const original = process.env.XDG_CONFIG_HOME;
            process.env.XDG_CONFIG_HOME = dir;
            try {
                const hooks = await SpecOpsPlugin(pluginInput());
                const config: Config = {};
                await hooks.config?.(config);

                expect(config.agent?.[SPECOPS_AGENT_ID]).toMatchObject({
                    description: "SpecOps coordinator for spec-driven development",
                    mode: "primary",
                    prompt: applyFrontierState(loadPrompt(AGENT_IDS.coordinator), false),
                });
                expect(
                    (
                        config.agent?.[SPECOPS_AGENT_ID]?.permission as
                            { question?: "allow" } | undefined
                    )?.question,
                ).toBe("allow");
                expect(config.agent?.[EXPLORER_AGENT_ID]).toEqual({
                    description:
                        "Investigates repository source, behavior, conventions, tests, constraints, and risks for planning and design. Use when the SpecOps coordinator needs focused repository evidence.",
                    mode: "subagent",
                    prompt: loadPrompt(AGENT_IDS.explorer),
                });
                expect(config.agent?.[PLANNER_AGENT_ID]).toEqual({
                    description:
                        "Authors OpenSpec planning artifacts — proposals, capability specifications, and implementation tasks — from the user's goal and repository evidence. Use this agent for SpecOps planning artifacts.",
                    mode: "subagent",
                    prompt: loadPrompt(AGENT_IDS.planner),
                });
                expect(config.agent?.[DESIGNER_AGENT_ID]).toEqual({
                    description:
                        "Authors the technical OpenSpec design from approved requirements and repository evidence. Use this agent to create design.md for SpecOps changes.",
                    mode: "subagent",
                    prompt: loadPrompt(AGENT_IDS.designer),
                });
                expect(config.agent?.[IMPLEMENTER_AGENT_ID]).toEqual({
                    description:
                        "Implements approved OpenSpec tasks in source and tests, runs verification, and marks completed tasks in tasks.md. Use this agent to execute SpecOps implementation plans.",
                    mode: "subagent",
                    prompt: loadPrompt(AGENT_IDS.implementer),
                });
                expect(config.agent?.[REVIEWER_AGENT_ID]).toEqual({
                    description:
                        "Independently verifies implemented OpenSpec changes against requirements, design, tasks, source code, and tests. Use this agent as the final SpecOps quality gate before completion.",
                    mode: "subagent",
                    prompt: loadPrompt(AGENT_IDS.reviewer),
                });
            } finally {
                process.env.XDG_CONFIG_HOME = original;
            }
        });
    });

    test("Frontier agent is absent when frontierEscalation is disabled", async () => {
        await withTempDir(async dir => {
            const original = process.env.XDG_CONFIG_HOME;
            process.env.XDG_CONFIG_HOME = dir;
            try {
                await writeSpecOpsConfig(dir, DEFAULT_CONFIG);

                const hooks = await SpecOpsPlugin(pluginInput());
                const config: Config = {};
                await hooks.config?.(config);

                expect(config.agent?.[FRONTIER_AGENT_ID]).toBeUndefined();
                expect(config.agent?.[SPECOPS_AGENT_ID]).toBeDefined();
                expect(config.agent?.[EXPLORER_AGENT_ID]).toBeDefined();
                expect(config.agent?.[PLANNER_AGENT_ID]).toBeDefined();
                expect(config.agent?.[DESIGNER_AGENT_ID]).toBeDefined();
                expect(config.agent?.[IMPLEMENTER_AGENT_ID]).toBeDefined();
                expect(config.agent?.[REVIEWER_AGENT_ID]).toBeDefined();
            } finally {
                process.env.XDG_CONFIG_HOME = original;
            }
        });
    });

    test("Frontier agent is registered when frontierEscalation is enabled", async () => {
        await withTempDir(async dir => {
            const original = process.env.XDG_CONFIG_HOME;
            process.env.XDG_CONFIG_HOME = dir;
            try {
                await writeSpecOpsConfig(dir, { ...DEFAULT_CONFIG, frontierEscalation: true });

                const hooks = await SpecOpsPlugin(pluginInput());
                const config: Config = {};
                await hooks.config?.(config);

                expect(config.agent?.[FRONTIER_AGENT_ID]).toMatchObject({
                    description:
                        "Advice-only consultation for genuinely difficult unresolved technical " +
                        "blockers raised by SpecOps specialists. Returns technical advice only; does " +
                        "not modify source, OpenSpec artifacts, tasks, workflow state, review " +
                        "verdicts, or lifecycle state.",
                    mode: "subagent",
                    prompt: loadPrompt(AGENT_IDS.frontier),
                });
            } finally {
                process.env.XDG_CONFIG_HOME = original;
            }
        });
    });

    test("Frontier agent applies configured model and variant when enabled", async () => {
        await withTempDir(async dir => {
            const original = process.env.XDG_CONFIG_HOME;
            process.env.XDG_CONFIG_HOME = dir;
            try {
                await writeSpecOpsConfig(dir, {
                    ...DEFAULT_CONFIG,
                    frontierEscalation: true,
                    agents: {
                        ...DEFAULT_CONFIG.agents,
                        [AGENT_IDS.frontier]: { model: "openference/GLM-5.2", variant: "high" },
                    },
                });

                const hooks = await SpecOpsPlugin(pluginInput());
                const config: Config = {};
                await hooks.config?.(config);

                expect(config.agent?.[FRONTIER_AGENT_ID]).toMatchObject({
                    model: "openference/GLM-5.2",
                    variant: "high",
                });
            } finally {
                process.env.XDG_CONFIG_HOME = original;
            }
        });
    });

    test("Frontier agent supports blank model fallback when enabled", async () => {
        await withTempDir(async dir => {
            const original = process.env.XDG_CONFIG_HOME;
            process.env.XDG_CONFIG_HOME = dir;
            try {
                await writeSpecOpsConfig(dir, {
                    ...DEFAULT_CONFIG,
                    frontierEscalation: true,
                    agents: {
                        ...DEFAULT_CONFIG.agents,
                        [AGENT_IDS.frontier]: { model: "   ", variant: "high" },
                    },
                });

                const hooks = await SpecOpsPlugin(pluginInput());
                const config: Config = {};
                await hooks.config?.(config);

                const frontierAgent = config.agent?.[FRONTIER_AGENT_ID];
                expect(frontierAgent).toBeDefined();
                expect(frontierAgent?.model).toBeUndefined();
                expect(frontierAgent?.variant).toBeUndefined();
            } finally {
                process.env.XDG_CONFIG_HOME = original;
            }
        });
    });

    test("Disabling frontier escalation does not affect normal agent registration", async () => {
        await withTempDir(async dir => {
            const original = process.env.XDG_CONFIG_HOME;
            process.env.XDG_CONFIG_HOME = dir;
            try {
                await writeSpecOpsConfig(dir, DEFAULT_CONFIG);

                const hooks = await SpecOpsPlugin(pluginInput());
                const config: Config = {};
                await hooks.config?.(config);

                expect(config.agent?.[FRONTIER_AGENT_ID]).toBeUndefined();
                expect(config.agent?.[SPECOPS_AGENT_ID]).toBeDefined();
                expect(config.agent?.[EXPLORER_AGENT_ID]).toBeDefined();
                expect(config.agent?.[PLANNER_AGENT_ID]).toBeDefined();
                expect(config.agent?.[DESIGNER_AGENT_ID]).toBeDefined();
                expect(config.agent?.[IMPLEMENTER_AGENT_ID]).toBeDefined();
                expect(config.agent?.[REVIEWER_AGENT_ID]).toBeDefined();
            } finally {
                process.env.XDG_CONFIG_HOME = original;
            }
        });
    });

    test("Coordinator prompt reflects disabled frontier escalation", async () => {
        await withTempDir(async dir => {
            const original = process.env.XDG_CONFIG_HOME;
            process.env.XDG_CONFIG_HOME = dir;
            try {
                await writeSpecOpsConfig(dir, DEFAULT_CONFIG);

                const hooks = await SpecOpsPlugin(pluginInput());
                const config: Config = {};
                await hooks.config?.(config);

                const prompt = config.agent?.[SPECOPS_AGENT_ID]?.prompt as string;
                expect(prompt).toContain("Frontier escalation is currently disabled");
                expect(prompt).not.toContain("Frontier escalation is currently enabled");
                expect(prompt).not.toContain("{{FRONTIER_ESCALATION_STATE}}");
            } finally {
                process.env.XDG_CONFIG_HOME = original;
            }
        });
    });

    test("Coordinator prompt reflects enabled frontier escalation", async () => {
        await withTempDir(async dir => {
            const original = process.env.XDG_CONFIG_HOME;
            process.env.XDG_CONFIG_HOME = dir;
            try {
                await writeSpecOpsConfig(dir, { ...DEFAULT_CONFIG, frontierEscalation: true });

                const hooks = await SpecOpsPlugin(pluginInput());
                const config: Config = {};
                await hooks.config?.(config);

                const prompt = config.agent?.[SPECOPS_AGENT_ID]?.prompt as string;
                expect(prompt).toContain("Frontier escalation is currently enabled");
                expect(prompt).not.toContain("Frontier escalation is currently disabled");
                expect(prompt).not.toContain("{{FRONTIER_ESCALATION_STATE}}");
            } finally {
                process.env.XDG_CONFIG_HOME = original;
            }
        });
    });

    test("Separate plugin loads with different frontierEscalation settings produce different agent catalogues", async () => {
        await withTempDir(async dir => {
            const original = process.env.XDG_CONFIG_HOME;
            process.env.XDG_CONFIG_HOME = dir;
            try {
                await writeSpecOpsConfig(dir, DEFAULT_CONFIG);

                const disabledHooks = await SpecOpsPlugin(pluginInput());
                const disabledConfig: Config = {};
                await disabledHooks.config?.(disabledConfig);

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
