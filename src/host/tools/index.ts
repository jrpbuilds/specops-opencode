import type { Plugin } from "@opencode-ai/plugin";
import { addArchiveTool } from "./archive.js";
import { addContextTool } from "./context.js";
import { addCreateChangeTool } from "./create-change.js";
import { addDoctorTool } from "./doctor.js";
import { addOnboardTool } from "./onboard.js";
import { addStatusTool } from "./status.js";
import { addValidateChangeTool } from "./validate-change.js";

type ToolDraft = Parameters<Parameters<Plugin.Context["tool"]["transform"]>[0]>[0];
type PinnedToolDefinition = Parameters<ToolDraft["add"]>[0];

/**
 * Bridge the current beta tool-draft registration churn.
 *
 * The pinned 17728 SDK accepts one object containing `name` and `options`, while
 * newer V2 docs expose `add(name, tool, options)`. The executor/schema contract
 * is otherwise compatible. Keeping this tiny bridge at the host boundary lets
 * SpecOps load on either shape while the OpenCode 2 API is still moving.
 */
export function compatibleToolDraft(tools: ToolDraft): ToolDraft {
    const add = tools.add as unknown as (...args: unknown[]) => void;
    if (add.length < 2) return tools;

    return {
        add(definition: PinnedToolDefinition) {
            const item = definition as PinnedToolDefinition & {
                name: string;
                options?: unknown;
            };
            const { name, options, ...tool } = item;
            add.call(tools, name, tool, options);
        },
    } as unknown as ToolDraft;
}

/** Register all SpecOps lifecycle tools as directly exposed OpenCode 2 tools. */
export async function registerTools(ctx: Plugin.Context): Promise<void> {
    await ctx.tool.transform(tools => {
        const compatible = compatibleToolDraft(tools);
        addArchiveTool(compatible, ctx);
        addContextTool(compatible, ctx);
        addCreateChangeTool(compatible, ctx);
        addDoctorTool(compatible, ctx);
        addOnboardTool(compatible, ctx);
        addStatusTool(compatible, ctx);
        addValidateChangeTool(compatible, ctx);
    });
}
