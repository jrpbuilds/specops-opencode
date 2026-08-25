import { tool } from "@opencode-ai/plugin/tool";
import { getArchiveInstructions } from "../../openspec/archive-instructions.js";
import { archiveInstructions } from "../../tools/archive-instructions.js";
import { requireLifecyclePermission } from "../lifecycle-permission.js";

/** Expose canonical OpenSpec archive instructions through the coordinator-only tool surface. */
export const archiveInstructionsTool = tool({
    description: "Read normalized OpenSpec archive instructions for a named change.",
    args: {
        change: tool.schema.string(),
    },
    async execute(args, context) {
        await requireLifecyclePermission(context, "specops_archive_instructions");
        context.metadata({ title: "Reading OpenSpec archive instructions…" });
        return archiveInstructions(args.change, {
            getArchiveInstructions: change => getArchiveInstructions(change, context.directory),
        });
    },
});
