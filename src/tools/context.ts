import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool";
import { getOpenSpecContext, type OpenSpecContextResult } from "../openspec/context.js";

/** Dependency boundary for the deterministic OpenSpec context tool. */
export type ContextDeps = {
    getContext: () => Promise<OpenSpecContextResult>;
};

/** Return current OpenSpec facts for Coordinator startup reasoning. */
export async function context(deps: ContextDeps): Promise<string> {
    return JSON.stringify(await deps.getContext(), null, 2);
}

/** Expose current OpenSpec facts without making workflow decisions. */
export const contextTool: ToolDefinition = tool({
    description:
        "Return deterministic current OpenSpec facts: availability, initialization, and active changes.",
    args: {},
    async execute(_args, toolContext) {
        toolContext.metadata({ title: "Reading OpenSpec context…" });
        return context({ getContext: () => getOpenSpecContext(toolContext.directory) });
    },
});
