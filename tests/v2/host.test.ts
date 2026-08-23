import type { Plugin } from "@opencode-ai/plugin";
import { describe, expect, test } from "bun:test";
import SpecOpsPlugin from "../../src/index.js";
import { DEFAULT_CONFIG, type SpecOpsConfig } from "../../src/config.js";
import {
    SPECOPS_AGENT_ID,
    SPECOPS_AUTO_AGENT_ID,
} from "../../src/agents/coordinator.js";
import { AGENT_IDS } from "../../src/agents/ids.js";
import { registerAgents, toV2ModelRef } from "../../src/host/agents.js";
import { COMMANDS, registerCommands } from "../../src/host/commands.js";
import {
    assertLifecycleAuthority,
    LIFECYCLE_TOOL_IDS,
    lifecycleToolVisible,
    registerLifecycleToolVisibility,
} from "../../src/host/authorization.js";
import {
    denyPrivateSpecOpsSubagents,
    toV2PermissionRules,
    type V2PermissionRule,
} from "../../src/host/permissions.js";
import { resolveSessionDirectory } from "../../src/host/session.js";
import { registerTools } from "../../src/host/tools/index.js";

const REGISTRATION_DISPOSE = { dispose: async () => undefined };

type MutableAgent = {
    id: string;
    name: string;
    description?: string;
    system?: string;
    mode: "primary" | "subagent" | "all";
    hidden: boolean;
    model?: { providerID: string; id: string; variant?: string };
    permissions: V2PermissionRule[];
};

type MutableCommand = {
    name: string;
    template: string;
    description?: string;
    agent?: string;
};

type RegisteredTool = {
    name: string;
    description: string;
    input: unknown;
    options?: { codemode?: boolean };
    execute: (input: unknown, context: any) => Promise<unknown>;
};

function agent(id: string, overrides: Partial<MutableAgent> = {}): MutableAgent {
    return {
        id,
        name: id,
        mode: "all",
        hidden: false,
        permissions: [],
        ...overrides,
    };
}

function config(overrides: Partial<SpecOpsConfig> = {}): SpecOpsConfig {
    return {
        ...structuredClone(DEFAULT_CONFIG),
        ...overrides,
        agents: {
            ...structuredClone(DEFAULT_CONFIG.agents),
            ...(overrides.agents ?? {}),
        },
    };
}

function fakeHost(initialAgents: MutableAgent[] = [agent("build", { mode: "primary" })]) {
    const agents = new Map(initialAgents.map(item => [item.id, item]));
    const commands = new Map<string, MutableCommand>();
    const tools = new Map<string, RegisteredTool>();
    const contextHooks: Array<(event: any) => unknown> = [];
    const sessions = new Map<string, any>([
        [
            "session-1",
            {
                id: "session-1",
                agent: "build",
                location: { directory: "/repo" },
                subpath: "packages/app",
            },
        ],
    ]);

    const ctx = {
        options: {},
        agent: {
            transform: async (transform: (draft: any) => unknown) => {
                await transform({
                    list: () => [...agents.values()],
                    get: (id: string) => agents.get(id),
                    update: (id: string, update: (item: MutableAgent) => void) => {
                        const item = agents.get(id) ?? agent(id);
                        agents.set(id, item);
                        update(item);
                    },
                    remove: (id: string) => agents.delete(id),
                });
                return REGISTRATION_DISPOSE;
            },
            get: async ({ agentID }: { agentID: string }) => ({
                location: {
                    directory: "/repo",
                    project: { id: "project", directory: "/repo", canonical: "/repo" },
                },
                data: agents.get(String(agentID)) ?? agent(String(agentID)),
            }),
        },
        command: {
            transform: async (transform: (draft: any) => unknown) => {
                await transform({
                    list: () => [...commands.values()],
                    get: (name: string) => commands.get(name),
                    update: (name: string, update: (item: MutableCommand) => void) => {
                        const item = commands.get(name) ?? { name, template: "" };
                        commands.set(name, item);
                        update(item);
                    },
                    remove: (name: string) => commands.delete(name),
                });
                return REGISTRATION_DISPOSE;
            },
        },
        tool: {
            transform: async (transform: (draft: any) => unknown) => {
                await transform({
                    list: () => [...tools.values()],
                    get: (name: string) => tools.get(name),
                    add: (definition: RegisteredTool) => tools.set(definition.name, definition),
                    remove: (name: string) => tools.delete(name),
                });
                return REGISTRATION_DISPOSE;
            },
        },
        session: {
            get: async ({ sessionID }: { sessionID: string }) => {
                const item = sessions.get(sessionID);
                if (!item) throw new Error(`missing session ${sessionID}`);
                return item;
            },
            hook: async (name: string, hook: (event: any) => unknown) => {
                if (name === "context") contextHooks.push(hook);
                return REGISTRATION_DISPOSE;
            },
        },
    } as unknown as Plugin.Context;

    return { ctx, agents, commands, tools, contextHooks, sessions };
}

function lastRule(agent: MutableAgent, action: string, resource?: string) {
    return [...agent.permissions]
        .reverse()
        .find(rule => rule.action === action && (resource === undefined || rule.resource === resource));
}

describe("OpenCode 2 plugin contract", () => {
    test("exports a native V2 server definition", () => {
        expect(SpecOpsPlugin.id).toBe("specops");
        expect(SpecOpsPlugin.tui).toBe(true);
        expect(typeof SpecOpsPlugin.setup).toBe("function");
    });

    test("maps configured provider/model/variant selections", () => {
        expect(toV2ModelRef("openai/gpt-5.6", "high")).toEqual({
            providerID: "openai",
            id: "gpt-5.6",
            variant: "high",
        });
        expect(() => toV2ModelRef("gpt-5.6")).toThrow("expected provider/model");
    });

    test("registers all SpecOps agents and preserves the private namespace boundary", async () => {
        const host = fakeHost([
            agent("build", {
                mode: "primary",
                permissions: [{ action: "subagent", resource: "*", effect: "allow" }],
            }),
        ]);
        const value = config();
        value.agents[AGENT_IDS.coordinator] = {
            model: "openai/gpt-5.6",
            variant: "high",
        };

        await registerAgents(host.ctx, value);

        expect([...host.agents.keys()].sort()).toEqual(
            [
                "build",
                SPECOPS_AGENT_ID,
                SPECOPS_AUTO_AGENT_ID,
                AGENT_IDS.explorer,
                AGENT_IDS.planner,
                AGENT_IDS.designer,
                AGENT_IDS.implementer,
                AGENT_IDS.reviewer,
            ].sort(),
        );

        const ordinary = host.agents.get("build")!;
        expect(lastRule(ordinary, "subagent", "specops-*")).toEqual({
            action: "subagent",
            resource: "specops-*",
            effect: "deny",
        });

        const coordinator = host.agents.get(SPECOPS_AGENT_ID)!;
        expect(coordinator.mode).toBe("primary");
        expect(coordinator.system).toContain("# SpecOps Coordinator");
        expect(coordinator.model).toEqual({
            providerID: "openai",
            id: "gpt-5.6",
            variant: "high",
        });
        expect(lastRule(coordinator, "subagent", "specops-*")?.effect).toBe("allow");
        expect(lastRule(coordinator, "question")?.effect).toBe("allow");

        const auto = host.agents.get(SPECOPS_AUTO_AGENT_ID)!;
        expect(lastRule(auto, "question")?.effect).toBe("deny");

        for (const id of [
            AGENT_IDS.explorer,
            AGENT_IDS.planner,
            AGENT_IDS.designer,
            AGENT_IDS.implementer,
            AGENT_IDS.reviewer,
        ]) {
            const specialist = host.agents.get(id)!;
            expect(specialist.mode).toBe("subagent");
            expect(specialist.hidden).toBe(true);
            expect(lastRule(specialist, "subagent")?.effect).toBe("deny");
        }
    });

    test("conditionally registers Frontier", async () => {
        const host = fakeHost();
        await registerAgents(host.ctx, config({ frontierEscalation: true }));
        expect(host.agents.has(AGENT_IDS.frontier)).toBe(true);
    });

    test("registers the stable slash-command catalogue", async () => {
        const host = fakeHost();
        await registerCommands(host.ctx);
        expect([...host.commands.keys()].sort()).toEqual(Object.keys(COMMANDS).sort());
        expect(host.commands.get("specops")?.agent).toBe(SPECOPS_AGENT_ID);
        expect(host.commands.get("specops-auto")?.agent).toBe(SPECOPS_AUTO_AGENT_ID);
        expect(host.commands.get("specops-update")?.agent).toBe(SPECOPS_AGENT_ID);
        expect(host.commands.get("specops-sync")?.agent).toBe(SPECOPS_AGENT_ID);
        expect(host.commands.get("specops-doctor")?.template).toContain("specops_doctor");
        expect(host.commands.get("specops-onboard")?.template).toContain("specops_onboard");
    });

    test("translates V1 capability names into ordered V2 permission rules", () => {
        expect(
            toV2PermissionRules({
                bash: { "*": "deny", "openspec *": "allow" },
                task: { "*": "deny", "specops-*": "allow" },
                question: "deny",
                doom_loop: "deny",
                specops_lifecycle: { "*": "allow" },
            }),
        ).toEqual([
            { action: "shell", resource: "*", effect: "deny" },
            { action: "shell", resource: "openspec *", effect: "allow" },
            { action: "subagent", resource: "*", effect: "deny" },
            { action: "subagent", resource: "specops-*", effect: "allow" },
            { action: "question", resource: "*", effect: "deny" },
        ]);

        expect(
            denyPrivateSpecOpsSubagents([
                { action: "subagent", resource: "specops-*", effect: "allow" },
                { action: "read", resource: "*", effect: "allow" },
            ]),
        ).toEqual([
            { action: "read", resource: "*", effect: "allow" },
            { action: "subagent", resource: "specops-*", effect: "deny" },
        ]);
    });

    test("registers all lifecycle tools as direct non-codemode tools", async () => {
        const host = fakeHost();
        await registerTools(host.ctx);
        expect([...host.tools.keys()].sort()).toEqual([...LIFECYCLE_TOOL_IDS].sort());
        for (const id of LIFECYCLE_TOOL_IDS) {
            expect(host.tools.get(id)?.options?.codemode).toBe(false);
        }
    });

    test("hard-denies lifecycle execution before progress for specialists", async () => {
        const host = fakeHost([agent(AGENT_IDS.planner, { mode: "subagent" })]);
        await registerTools(host.ctx);
        let progressed = false;

        await expect(
            host.tools.get("specops_status")!.execute(
                { change: "demo" },
                {
                    sessionID: "session-1",
                    agent: AGENT_IDS.planner,
                    progress: async () => {
                        progressed = true;
                    },
                },
            ),
        ).rejects.toThrow("not authorized");
        expect(progressed).toBe(false);
    });

    test("permits doctor/onboard only to ordinary primary/all agents outside coordinators", async () => {
        const primary = fakeHost([agent("build", { mode: "primary" })]);
        await expect(
            assertLifecycleAuthority(primary.ctx, "specops_doctor", {
                sessionID: "session-1",
                agent: "build",
            }),
        ).resolves.toBeUndefined();
        await expect(
            assertLifecycleAuthority(primary.ctx, "specops_archive", {
                sessionID: "session-1",
                agent: "build",
            }),
        ).rejects.toThrow("not authorized");

        const subagent = fakeHost([agent("worker", { mode: "subagent" })]);
        await expect(
            assertLifecycleAuthority(subagent.ctx, "specops_onboard", {
                sessionID: "session-1",
                agent: "worker",
            }),
        ).rejects.toThrow("not authorized");
    });

    test("resolves the current session directory including subpath", async () => {
        const host = fakeHost();
        expect(await resolveSessionDirectory(host.ctx, "session-1")).toBe("/repo/packages/app");
        host.sessions.set("root", { id: "root", location: { directory: "/repo" } });
        expect(await resolveSessionDirectory(host.ctx, "root")).toBe("/repo");
        host.sessions.set("broken", { id: "broken", location: {} });
        await expect(resolveSessionDirectory(host.ctx, "broken")).rejects.toThrow(
            "could not resolve a directory",
        );
    });

    test("filters lifecycle tools from model context by agent authority", async () => {
        const host = fakeHost();
        await registerLifecycleToolVisibility(host.ctx);
        expect(host.contextHooks).toHaveLength(1);

        const specialistEvent = {
            agent: AGENT_IDS.planner,
            tools: Object.fromEntries([...LIFECYCLE_TOOL_IDS, "read"].map(id => [id, {}])),
        };
        await host.contextHooks[0](specialistEvent);
        expect(Object.keys(specialistEvent.tools)).toEqual(["read"]);

        const ordinaryEvent = {
            agent: "build",
            tools: Object.fromEntries([...LIFECYCLE_TOOL_IDS, "read"].map(id => [id, {}])),
        };
        await host.contextHooks[0](ordinaryEvent);
        expect(Object.keys(ordinaryEvent.tools).sort()).toEqual(
            ["read", "specops_doctor", "specops_onboard"].sort(),
        );

        expect(lifecycleToolVisible("specops_archive", SPECOPS_AGENT_ID)).toBe(true);
        expect(lifecycleToolVisible("specops_doctor", "build")).toBe(true);
        expect(lifecycleToolVisible("specops_doctor", AGENT_IDS.planner)).toBe(false);
    });
});
