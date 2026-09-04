import { tool } from "@opencode-ai/plugin/tool";
import { getApplyInstructions } from "../../openspec/apply-instructions.js";
import { progress } from "../../tools/progress.js";
import { snapshotParallelProgress } from "../parallel-progress.js";
import { requireLifecyclePermission } from "../lifecycle-permission.js";
import { recordSessionBinding } from "../session-bindings.js";
import { withTodoRefreshReminder } from "./todo-refresh.js";

/**
 * Expose read-only parallel progress through the coordinator-only tool surface.
 *
 * Progress is derived by the runtime: when the coordinator calls the tool
 * without supplying snapshots or assignments, the report is built from the
 * dispatch lifecycle this process observed (`../parallel-progress.ts`),
 * reconciled against fresh durable task state by the deterministic core.
 * Explicitly supplied arguments keep their pre-existing meaning.
 */
export const progressTool = tool({
    description:
        "Report in-flight parallel progress for a named change: review critic fan-out " +
        "status and implementer dispatch progress against durable task checkboxes.",
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
        // When the coordinator supplies no bookkeeping state, derive the
        // report from observed dispatch lifecycle; the empty dispatch list
        // keeps the implementer view present so the report stays ambient.
        const snapshot =
            args.reviewFanout === undefined && args.implementerAssignments === undefined
                ? snapshotParallelProgress(context.sessionID)
                : undefined;
        const effectiveArgs = snapshot
            ? {
                  ...args,
                  ...(snapshot.reviewFanout ? { reviewFanout: snapshot.reviewFanout } : {}),
                  implementerDispatches: snapshot.implementerDispatches ?? [],
              }
            : args;
        return withTodoRefreshReminder(
            await progress(effectiveArgs, {
                getApplyInstructions: change => getApplyInstructions(change, context.directory),
            }),
        );
    },
});
