import type { ToolContext, ToolDefinition } from "@opencode-ai/plugin/tool";
import { describe, expect, test } from "bun:test";
import { archiveTool } from "../../src/tools/archive.js";
import { contextTool } from "../../src/tools/context.js";
import { createChangeTool } from "../../src/tools/create-change.js";
import { doctorTool } from "../../src/tools/doctor.js";
import { onboardTool } from "../../src/tools/onboard.js";
import { statusTool } from "../../src/tools/status.js";
import { validateChangeTool } from "../../src/tools/validate-change.js";
import { SpecOpsPlugin } from "../../src/index.js";
import { withTempDir } from "../helpers.js";

type AskRequest = Parameters<ToolContext["ask"]>[0];

const LIFECYCLE_TOOLS: Array<{
    id: string;
    definition: ToolDefinition;
    args: Record<string, unknown>;
}> = [
    { id: "specops_archive", definition: archiveTool, args: { change: "example" } },
    { id: "specops_context", definition: contextTool, args: {} },
    { id: "specops_create_change", definition: createChangeTool, args: { change: "example" } },
    { id: "specops_doctor", definition: doctorTool, args: {} },
    { id: "specops_onboard", definition: onboardTool, args: {} },
    { id: "specops_status", definition: statusTool, args: { change: "example" } },
    {
        id: "specops_validate_change",
        definition: validateChangeTool,
        args: { change: "example" },
    },
];

function pluginInput(directory: string) {
    return {
        directory,
        worktree: directory,
        project: {},
        client: {},
        serverUrl: new URL("http://127.0.0.1"),
        $() {},
        experimental_workspace: { register() {} },
    } as never;
}

function toolContext(
    directory: string,
    ask: ToolContext["ask"],
    metadata: ToolContext["metadata"],
): ToolContext {
    return {
        sessionID: "test-session",
        messageID: "test-message",
        agent: "test-agent",
        directory,
        worktree: directory,
        abort: new AbortController().signal,
        ask,
        metadata,
    };
}

describe("lifecycle tool integration", () => {
    test.each(LIFECYCLE_TOOLS)("$id checks lifecycle permission before proceeding", async item => {
        await withTempDir(async directory => {
            const originalConfigHome = process.env.XDG_CONFIG_HOME;
            process.env.XDG_CONFIG_HOME = directory;
            try {
                const requests: AskRequest[] = [];
                let metadataCalls = 0;
                const context = toolContext(
                    directory,
                    async request => {
                        requests.push(request);
                    },
                    () => {
                        metadataCalls += 1;
                    },
                );

                await item.definition.execute(item.args, context);

                expect(requests).toEqual([
                    {
                        permission: "specops_lifecycle",
                        patterns: [item.id],
                        always: [item.id],
                        metadata: { tool: item.id },
                    },
                ]);
                expect(metadataCalls).toBe(1);
            } finally {
                process.env.XDG_CONFIG_HOME = originalConfigHome;
            }
        });
    });

    test.each(LIFECYCLE_TOOLS)("$id stops before side effects when denied", async item => {
        await withTempDir(async directory => {
            let metadataCalls = 0;
            const denial = new Error("lifecycle denied");
            const context = toolContext(
                directory,
                async () => {
                    throw denial;
                },
                () => {
                    metadataCalls += 1;
                },
            );

            await expect(item.definition.execute(item.args, context)).rejects.toBe(denial);
            expect(metadataCalls).toBe(0);
        });
    });

    test("registers exactly the current lifecycle tool catalogue", async () => {
        await withTempDir(async directory => {
            const hooks = await SpecOpsPlugin(pluginInput(directory));

            expect(Object.keys(hooks.tool ?? {}).sort()).toEqual([
                "specops_archive",
                "specops_context",
                "specops_create_change",
                "specops_doctor",
                "specops_onboard",
                "specops_status",
                "specops_validate_change",
            ]);
        });
    });

    test("every registered SpecOps tool performs the lifecycle check", async () => {
        await withTempDir(async directory => {
            const hooks = await SpecOpsPlugin(pluginInput(directory));
            for (const [id, definition] of Object.entries(hooks.tool ?? {})) {
                const requests: AskRequest[] = [];
                let metadataCalls = 0;
                const context = toolContext(
                    directory,
                    async request => {
                        requests.push(request);
                        throw new Error("lifecycle denied");
                    },
                    () => {
                        metadataCalls += 1;
                    },
                );

                const args = id === "specops_validate_change" ? { change: "example" } : {};
                await expect(definition.execute(args, context)).rejects.toThrow("lifecycle denied");
                expect(requests).toHaveLength(1);
                expect(requests[0]).toEqual({
                    permission: "specops_lifecycle",
                    patterns: [id],
                    always: [id],
                    metadata: { tool: id },
                });
                expect(metadataCalls).toBe(0);
            }
        });
    });
});
