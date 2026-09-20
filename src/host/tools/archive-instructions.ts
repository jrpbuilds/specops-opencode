import { tool } from "@opencode-ai/plugin/tool";
import { getArchiveInstructions } from "../../openspec/archive-instructions.js";
import { archiveInstructions } from "../../tools/archive-instructions.js";
import { requireLifecyclePermission } from "../lifecycle-permission.js";
import { recordSessionBinding } from "../session-bindings.js";
import { withTodoRefreshReminder } from "./todo-refresh.js";

/** Expose canonical OpenSpec archive instructions through the orchestrator-only tool surface. */
export const archiveInstructionsTool = tool({
    description: "Read normalized OpenSpec archive instructions for a named change.",
    args: {
        change: tool.schema.string(),
    },
    async execute(args, context) {
        await requireLifecyclePermission(context, "specops_archive_instructions");
        recordSessionBinding(context.sessionID, context.agent, args.change);
        context.metadata({ title: "Reading OpenSpec archive instructions…" });
        return withTodoRefreshReminder(
            await archiveInstructions(args.change, {
                getArchiveInstructions: change => getArchiveInstructions(change, context.directory),
            }),
            context,
        );
    },
});
