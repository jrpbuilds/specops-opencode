import { tool } from "@opencode-ai/plugin/tool";
import { getApplyInstructions } from "../../openspec/apply-instructions.js";
import { progress } from "../../tools/progress.js";
import { requireLifecyclePermission } from "../lifecycle-permission.js";
import { recordSessionBinding } from "../session-bindings.js";
import { withTodoRefreshReminder } from "./todo-refresh.js";

/**
 * Expose read-only parallel progress through the coordinator-only tool surface.
 *
 * Fan-out snapshots and implementer assignments are coordinator-supplied
 * arguments; the core reads durable task state itself. The session directory
 * is supplied by OpenCode so the durable read targets the current project.
 */
export const progressTool = tool({
    description:
        "Report in-flight parallel progress for a named change: review critic fan-out " +
        "status and implementer assignment progress against durable task checkboxes.",
    args: {
        change: tool.schema.string(),
        // Shape-only validation at the host boundary: the four fan-out lists
        // stay individually optional because the all-four-or-none rule is a
        // cross-field invariant owned by the deterministic core.
        reviewFanout: tool.schema
            .object({
                pending: tool.schema.array(tool.schema.string()).optional(),
                inFlight: tool.schema.array(tool.schema.string()).optional(),
                completed: tool.schema.array(tool.schema.string()).optional(),
                failed: tool.schema.array(tool.schema.string()).optional(),
            })
            .optional(),
        implementerAssignments: tool.schema
            .array(
                tool.schema.object({
                    dispatchId: tool.schema.string().optional(),
                    taskIds: tool.schema.array(tool.schema.string()),
                }),
            )
            .optional(),
    },
    async execute(args, context) {
        await requireLifecyclePermission(context, "specops_progress");
        recordSessionBinding(context.sessionID, context.agent, args.change);
        context.metadata({ title: "Reading parallel progress…" });
        return withTodoRefreshReminder(
            await progress(args, {
                getApplyInstructions: change => getApplyInstructions(change, context.directory),
            }),
        );
    },
});
