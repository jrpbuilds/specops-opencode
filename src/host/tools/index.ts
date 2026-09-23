import type { ToolDefinition } from "@opencode-ai/plugin/tool";
import { archiveTool } from "./archive.js";
import { archiveInstructionsTool } from "./archive-instructions.js";
import { applyInstructionsTool } from "./apply-instructions.js";
import { configTool } from "./config.js";
import { contextTool } from "./context.js";
import { createChangeTool } from "./create-change.js";
import { doctorTool } from "./doctor.js";
import { onboardTool } from "./onboard.js";
import { progressTool } from "./progress.js";
import { reviewGuardTool } from "./review-guard.js";
import { reviewLanesTool } from "./review-lanes.js";
import { statusTool } from "./status.js";
import { validateChangeTool } from "./validate-change.js";

/**
 * OpenCode 1 lifecycle and runtime-coordination tools, keyed by their
 * registered names. Deterministic workflow cores live in `src/tools/`; the
 * review-lane wrapper manages session-scoped execution state in the host layer.
 */
export const TOOLS: Record<string, ToolDefinition> = {
    specops_archive: archiveTool,
    specops_archive_instructions: archiveInstructionsTool,
    specops_apply_instructions: applyInstructionsTool,
    specops_config: configTool,
    specops_context: contextTool,
    specops_create_change: createChangeTool,
    specops_doctor: doctorTool,
    specops_onboard: onboardTool,
    specops_progress: progressTool,
    specops_review_guard: reviewGuardTool,
    specops_review_lanes: reviewLanesTool,
    specops_status: statusTool,
    specops_validate_change: validateChangeTool,
};
