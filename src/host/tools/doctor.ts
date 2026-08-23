import { tool } from "@opencode-ai/plugin/tool";
import { loadConfig } from "../../config.js";
import { getOpenSpecVersion } from "../../openspec/cli.js";
import { runOpenSpecDoctor } from "../../openspec/doctor.js";
import { getSpecOpsVersion } from "../../version.js";
import { doctor } from "../../tools/doctor.js";
import { requireLifecyclePermission } from "../lifecycle-permission.js";

/**
 * Expose the diagnostics report through the SpecOps tool surface.
 *
 * The tool supplies the current configuration and project directory through
 * injected operations while leaving report formatting in `doctor`.
 */
export const doctorTool = tool({
    description:
        "Run SpecOps diagnostics: report versions, OpenSpec health, configuration validity, and model-role mappings.",
    args: {},
    async execute(_args, context) {
        await requireLifecyclePermission(context, "specops_doctor");
        context.metadata({ title: "Running SpecOps doctor…" });
        return doctor({
            specopsVersion: getSpecOpsVersion,
            openspecVersion: getOpenSpecVersion,
            openspecDoctor: () => runOpenSpecDoctor(context.directory),
            loadConfig: () => loadConfig(),
        });
    },
});
