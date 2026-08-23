import { tool } from "@opencode-ai/plugin/tool";
import { archiveChange } from "../../openspec/archive.js";
import { archive } from "../../tools/archive.js";
import { requireLifecyclePermission } from "../lifecycle-permission.js";

/**
 * Expose native OpenSpec archiving through the SpecOps tool surface.
 *
 * The session directory is supplied by OpenCode so archiving targets the
 * current project rather than the process working directory.
 */
export const archiveTool = tool({
    description: "Archive a named OpenSpec change using the native OpenSpec archive operation.",
    args: {
        change: tool.schema.string(),
    },
    async execute(args, context) {
        await requireLifecyclePermission(context, "specops_archive");
        context.metadata({ title: "Archiving OpenSpec change…" });
        return archive(args.change, {
            archiveChange: change => archiveChange(change, context.directory),
        });
    },
});
