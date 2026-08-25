import type { ToolDefinition } from "@opencode-ai/plugin/tool";
import { archiveTool } from "./archive.js";
import { configTool } from "./config.js";
import { contextTool } from "./context.js";
import { createChangeTool } from "./create-change.js";
import { doctorTool } from "./doctor.js";
import { onboardTool } from "./onboard.js";
import { statusTool } from "./status.js";
import { validateChangeTool } from "./validate-change.js";

/**
 * OpenCode 1 lifecycle tools exposed by the plugin, keyed by their registered
 * tool names. Each entry is a V1 wrapper around a deterministic function in
 * `src/tools/`.
 */
export const TOOLS: Record<string, ToolDefinition> = {
    specops_archive: archiveTool,
    specops_config: configTool,
    specops_context: contextTool,
    specops_create_change: createChangeTool,
    specops_doctor: doctorTool,
    specops_onboard: onboardTool,
    specops_status: statusTool,
    specops_validate_change: validateChangeTool,
};
