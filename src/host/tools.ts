import type { ToolDefinition } from "@opencode-ai/plugin/tool";
import { archiveTool } from "../tools/archive.js";
import { contextTool } from "../tools/context.js";
import { createChangeTool } from "../tools/create-change.js";
import { doctorTool } from "../tools/doctor.js";
import { onboardTool } from "../tools/onboard.js";
import { statusTool } from "../tools/status.js";
import { validateChangeTool } from "../tools/validate-change.js";

/**
 * Deterministic lifecycle tools exposed by the plugin, keyed by their
 * registered tool names.
 */
export const TOOLS: Record<string, ToolDefinition> = {
    specops_archive: archiveTool,
    specops_context: contextTool,
    specops_create_change: createChangeTool,
    specops_doctor: doctorTool,
    specops_onboard: onboardTool,
    specops_status: statusTool,
    specops_validate_change: validateChangeTool,
};
