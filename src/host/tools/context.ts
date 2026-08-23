import { tool } from "@opencode-ai/plugin/tool";
import { getOpenSpecContext } from "../../openspec/context.js";
import { context } from "../../tools/context.js";
import { requireLifecyclePermission } from "../lifecycle-permission.js";

/** Expose current OpenSpec facts without making workflow decisions. */
export const contextTool = tool({
    description:
        "Return deterministic current OpenSpec facts: availability, initialization, and active changes.",
    args: {},
    async execute(_args, toolContext) {
        await requireLifecyclePermission(toolContext, "specops_context");
        toolContext.metadata({ title: "Reading OpenSpec context…" });
        return context({ getContext: () => getOpenSpecContext(toolContext.directory) });
    },
});
