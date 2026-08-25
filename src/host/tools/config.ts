import { tool } from "@opencode-ai/plugin/tool";
import { configView } from "../../tools/config.js";
import { getProcessConfig } from "../config-snapshot.js";
import { requireLifecyclePermission } from "../lifecycle-permission.js";

/**
 * Expose the effective SpecOps configuration snapshot to coordinators only.
 *
 * The process-effective configuration is captured once at plugin startup (see
 * `src/host/config-snapshot.ts`). SpecOps configuration changes require an
 * OpenCode restart before they become effective; this tool does not support
 * live reload. Access is restricted to the two SpecOps coordinators through
 * the existing lifecycle permission boundary: specialists carry an explicit
 * `specops_lifecycle: deny` invariant, and ordinary primary agents are denied
 * through the `"*": "deny"` fallback of `ORDINARY_LIFECYCLE_PERMISSION` (which
 * intentionally allowlists only `specops_doctor` and `specops_onboard`).
 */
export const configTool = tool({
    description:
        "Read the effective SpecOps configuration snapshot for the current OpenCode process.",
    args: {},
    async execute(_args, context) {
        await requireLifecyclePermission(context, "specops_config");
        context.metadata({ title: "Reading SpecOps config…" });
        return JSON.stringify(configView({ getConfig: getProcessConfig }), null, 2);
    },
});
