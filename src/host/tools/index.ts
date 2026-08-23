import type { Plugin } from "@opencode-ai/plugin";
import { addArchiveTool } from "./archive.js";
import { addContextTool } from "./context.js";
import { addCreateChangeTool } from "./create-change.js";
import { addDoctorTool } from "./doctor.js";
import { addOnboardTool } from "./onboard.js";
import { addStatusTool } from "./status.js";
import { addValidateChangeTool } from "./validate-change.js";

/** Register all SpecOps lifecycle tools as directly exposed OpenCode 2 tools. */
export async function registerTools(ctx: Plugin.Context): Promise<void> {
    await ctx.tool.transform(tools => {
        addArchiveTool(tools, ctx);
        addContextTool(tools, ctx);
        addCreateChangeTool(tools, ctx);
        addDoctorTool(tools, ctx);
        addOnboardTool(tools, ctx);
        addStatusTool(tools, ctx);
        addValidateChangeTool(tools, ctx);
    });
}
