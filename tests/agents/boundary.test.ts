import type { Config } from "@opencode-ai/plugin";
import { describe, expect, test } from "bun:test";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { SPECOPS_AGENT_ID, SPECOPS_AUTO_AGENT_ID } from "../../src/agents/coordinator.js";
import { EXPLORER_AGENT_ID } from "../../src/agents/explorer.js";
import { PLANNER_AGENT_ID } from "../../src/agents/planner.js";
import { DESIGNER_AGENT_ID } from "../../src/agents/designer.js";
import { IMPLEMENTER_AGENT_ID } from "../../src/agents/implementer.js";
import { REVIEWER_AGENT_ID } from "../../src/agents/reviewer.js";
import { FRONTIER_AGENT_ID } from "../../src/agents/frontier.js";
import {
    applyLifecycleBoundary,
    applyTaskBoundary,
    isSpecOpsAgentKey,
} from "../../src/agents/boundary.js";
import {
    ORDINARY_LIFECYCLE_PERMISSION,
    SPECOPS_LIFECYCLE_PERMISSION,
    SPECOPS_TASK_GLOB,
} from "../../src/agents/permissions.js";
import { SpecOpsPlugin } from "../../src/index.js";
import { DEFAULT_CONFIG } from "../../src/config.js";
import { withTempDir } from "../helpers.js";

const INTERNAL_SUBAGENT_IDS = [
    EXPLORER_AGENT_ID,
    PLANNER_AGENT_ID,
    DESIGNER_AGENT_ID,
    IMPLEMENTER_AGENT_ID,
    REVIEWER_AGENT_ID,
    FRONTIER_AGENT_ID,
];

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

async function runPluginConfig(
    config: Config,
    specOpsConfig: object = DEFAULT_CONFIG,
): Promise<void> {
    await withTempDir(async dir => {
        const original = process.env.XDG_CONFIG_HOME;
        process.env.XDG_CONFIG_HOME = dir;
        try {
            await writeSpecOpsConfig(dir, specOpsConfig);
            const hooks = await SpecOpsPlugin(pluginInput());
            await hooks.config?.(config);
        } finally {
            process.env.XDG_CONFIG_HOME = original;
        }
    });
}

describe("isSpecOpsAgentKey", () => {
    test("recognizes the coordinators and every specops-* agent", () => {
        expect(isSpecOpsAgentKey(SPECOPS_AGENT_ID)).toBe(true);
        expect(isSpecOpsAgentKey(SPECOPS_AUTO_AGENT_ID)).toBe(true);
        for (const id of INTERNAL_SUBAGENT_IDS) {
            expect(isSpecOpsAgentKey(id)).toBe(true);
        }
    });

    test("rejects arbitrary and native agent keys", () => {
        expect(isSpecOpsAgentKey("build")).toBe(false);
        expect(isSpecOpsAgentKey("plan")).toBe(false);
        expect(isSpecOpsAgentKey("custom")).toBe(false);
        expect(isSpecOpsAgentKey("third-party")).toBe(false);
    });
});

describe("applyTaskBoundary", () => {
    test("adds a global specops-* task deny when permission is undefined", () => {
        const config: Config = {};
        applyTaskBoundary(config);
        expect((config.permission as Record<string, unknown>).task).toEqual({
            [SPECOPS_TASK_GLOB]: "deny",
        });
    });

    test("normalizes a scalar global task allow into a star rule plus deny", () => {
        const config = { permission: { task: "allow" } } as unknown as Config;
        applyTaskBoundary(config);
        expect((config.permission as Record<string, unknown>).task).toEqual({
            "*": "allow",
            [SPECOPS_TASK_GLOB]: "deny",
        });
    });

    test("preserves unrelated global permission keys and existing task maps", () => {
        const config = {
            permission: { edit: "deny", task: { "my-agent": "allow" } },
        } as unknown as Config;
        applyTaskBoundary(config);
        const permission = config.permission as Record<string, unknown>;
        expect(permission.edit).toBe("deny");
        expect(permission.task).toEqual({ "my-agent": "allow", [SPECOPS_TASK_GLOB]: "deny" });
    });

    test("adds a per-agent deny to a custom agent with a broad task allow", () => {
        const config = {
            agent: {
                custom: { mode: "primary", permission: { task: { "*": "allow" } } },
            },
        } as unknown as Config;
        applyTaskBoundary(config);

        const custom = config.agent?.custom as { permission?: Record<string, unknown> };
        expect(custom.permission?.task).toEqual({ "*": "allow", [SPECOPS_TASK_GLOB]: "deny" });
    });

    test("adds a per-agent deny even to an agent with a top-level star allow", () => {
        const config = {
            agent: {
                custom: { mode: "primary", permission: { "*": "allow" } },
            },
        } as unknown as Config;
        applyTaskBoundary(config);

        const custom = config.agent?.custom as { permission?: Record<string, unknown> };
        expect(custom.permission?.["*"]).toBe("allow");
        expect(custom.permission?.task).toEqual({ [SPECOPS_TASK_GLOB]: "deny" });
    });

    test("leaves SpecOps coordinators and subagents untouched", () => {
        const config = {
            agent: {
                [SPECOPS_AGENT_ID]: { mode: "primary", permission: { question: "allow" } },
                [EXPLORER_AGENT_ID]: { mode: "subagent", permission: { task: { "*": "deny" } } },
            },
        } as unknown as Config;
        applyTaskBoundary(config);

        const coordinator = config.agent?.[SPECOPS_AGENT_ID] as {
            permission?: Record<string, unknown>;
        };
        expect(coordinator.permission).toEqual({ question: "allow" });

        const explorer = config.agent?.[EXPLORER_AGENT_ID] as {
            permission?: Record<string, unknown>;
        };
        expect(explorer.permission).toEqual({ task: { "*": "deny" } });
    });
});

describe("SpecOpsPlugin boundary integration", () => {
    test("registers internal subagents hidden with task deny, coordinators primary with task allow", async () => {
        const config: Config = {};
        await runPluginConfig(config, { ...DEFAULT_CONFIG, frontierEscalation: true });

        for (const id of INTERNAL_SUBAGENT_IDS) {
            expect(config.agent?.[id]).toMatchObject({
                mode: "subagent",
                hidden: true,
                permission: { task: { "*": "deny" } },
            });
        }

        expect(config.agent?.[SPECOPS_AGENT_ID]).toMatchObject({ mode: "primary" });
        expect(config.agent?.[SPECOPS_AUTO_AGENT_ID]).toMatchObject({ mode: "primary" });

        const coordinator = config.agent?.[SPECOPS_AGENT_ID] as {
            permission?: Record<string, unknown>;
        };
        expect(coordinator.permission?.task).toEqual({ "*": "deny", "specops-*": "allow" });

        const auto = config.agent?.[SPECOPS_AUTO_AGENT_ID] as {
            permission?: Record<string, unknown>;
        };
        expect(auto.permission?.task).toEqual({ "*": "deny", "specops-*": "allow" });
        expect(auto.permission?.question).toBe("deny");
        expect(auto.permission?.external_directory).toBe("deny");
        expect(auto.permission?.doom_loop).toBe("deny");
        expect(auto.permission?.[SPECOPS_LIFECYCLE_PERMISSION]).toBe("allow");

        for (const id of INTERNAL_SUBAGENT_IDS) {
            const permission = config.agent?.[id]?.permission as Record<string, unknown>;
            expect(permission[SPECOPS_LIFECYCLE_PERMISSION]).toBe("deny");
        }

        expect(
            (config.permission as Record<string, unknown>)[SPECOPS_LIFECYCLE_PERMISSION],
        ).toEqual(ORDINARY_LIFECYCLE_PERMISSION);

        expect((config.permission as Record<string, unknown>).task).toEqual({
            [SPECOPS_TASK_GLOB]: "deny",
        });
    });

    test("preserves a seeded user global permission through the plugin", async () => {
        const config = { permission: { edit: "deny", task: "allow" } } as unknown as Config;
        await runPluginConfig(config);

        const permission = config.permission as Record<string, unknown>;
        expect(permission.edit).toBe("deny");
        expect(permission.task).toEqual({ "*": "allow", [SPECOPS_TASK_GLOB]: "deny" });
    });

    test("preserves a seeded custom agent permission and still denies specops-*", async () => {
        const config = {
            agent: {
                custom: { mode: "primary", permission: { task: { "*": "allow" } } },
            },
        } as unknown as Config;
        await runPluginConfig(config);

        const custom = config.agent?.custom as { permission?: Record<string, unknown> };
        expect(custom.permission?.task).toEqual({ "*": "allow", [SPECOPS_TASK_GLOB]: "deny" });
        expect(custom.permission?.[SPECOPS_LIFECYCLE_PERMISSION]).toEqual(
            ORDINARY_LIFECYCLE_PERMISSION,
        );
    });

    test("ordinary primary agents may use only the user-facing lifecycle tools", async () => {
        const config = {
            agent: {
                build: {
                    mode: "primary",
                    permission: {
                        [SPECOPS_LIFECYCLE_PERMISSION]: { "*": "allow" },
                    },
                },
            },
        } as unknown as Config;
        await runPluginConfig(config);

        expect(
            (config.permission as Record<string, unknown>)[SPECOPS_LIFECYCLE_PERMISSION],
        ).toEqual(ORDINARY_LIFECYCLE_PERMISSION);
        const build = config.agent?.build as { permission?: Record<string, unknown> };
        expect(build.permission?.[SPECOPS_LIFECYCLE_PERMISSION]).toEqual(
            ORDINARY_LIFECYCLE_PERMISSION,
        );
    });

    test("frontier agent is registered (hidden, task deny) only when escalation is enabled", async () => {
        const disabled: Config = {};
        await runPluginConfig(disabled, DEFAULT_CONFIG);
        expect(disabled.agent?.[FRONTIER_AGENT_ID]).toBeUndefined();

        const enabled: Config = {};
        await runPluginConfig(enabled, { ...DEFAULT_CONFIG, frontierEscalation: true });
        expect(enabled.agent?.[FRONTIER_AGENT_ID]).toMatchObject({
            mode: "subagent",
            hidden: true,
            permission: { task: { "*": "deny" } },
        });
    });
});

describe("applyLifecycleBoundary", () => {
    test("preserves unrelated global permission keys", () => {
        const config = {
            permission: { edit: "deny", [SPECOPS_LIFECYCLE_PERMISSION]: "allow" },
        } as unknown as Config;

        applyLifecycleBoundary(config);

        const permission = config.permission as Record<string, unknown>;
        expect(permission.edit).toBe("deny");
        expect(permission[SPECOPS_LIFECYCLE_PERMISSION]).toEqual(ORDINARY_LIFECYCLE_PERMISSION);
    });

    test("does not overwrite SpecOps role entries", () => {
        const config = {
            agent: {
                [SPECOPS_AGENT_ID]: {
                    mode: "primary",
                    permission: { [SPECOPS_LIFECYCLE_PERMISSION]: "allow" },
                },
                [EXPLORER_AGENT_ID]: {
                    mode: "subagent",
                    permission: { [SPECOPS_LIFECYCLE_PERMISSION]: "deny" },
                },
            },
        } as unknown as Config;

        applyLifecycleBoundary(config);

        expect(
            (config.agent?.[SPECOPS_AGENT_ID]?.permission as Record<string, unknown>)[
                SPECOPS_LIFECYCLE_PERMISSION
            ],
        ).toBe("allow");
        expect(
            (config.agent?.[EXPLORER_AGENT_ID]?.permission as Record<string, unknown>)[
                SPECOPS_LIFECYCLE_PERMISSION
            ],
        ).toBe("deny");
    });
});
