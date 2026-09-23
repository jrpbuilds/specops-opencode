import { tool } from "@opencode-ai/plugin/tool";
import { getApplyInstructions } from "../../openspec/apply-instructions.js";
import { progress } from "../../tools/progress.js";
import { snapshotParallelProgress } from "../parallel-progress.js";
import { requireLifecyclePermission } from "../lifecycle-permission.js";
import { recordSessionBinding } from "../session-bindings.js";
import { withTodoRefreshReminder } from "./todo-refresh.js";

/**
 * Expose read-only parallel progress through the orchestrator-only tool surface.
 *
 * A diagnostic/recovery view, not an orchestration step: normal SpecOps
 * operation never requires calling it. Every report is derived by the runtime
 * from the dispatch lifecycle this process observed (`../parallel-progress.ts`),
 * reconciled against fresh durable task state by the deterministic core; the
 * orchestrator supplies no progress state of its own.
 */
export const progressTool = tool({
    description:
        "Read-only diagnostic view of in-flight parallel progress for a named change: " +
        "review critic fan-out status and implementer dispatch progress, as observed by " +
        "the runtime and reconciled against durable task checkboxes.",
    args: {
        change: tool.schema.string(),
    },
    async execute(args, context) {
        await requireLifecyclePermission(context, "specops_progress");
        recordSessionBinding(context.sessionID, context.agent, args.change);
        context.metadata({ title: "Reading parallel progress…" });
        // The empty dispatch list keeps the implementer view present when
        // nothing was observed, so the report stays ambient.
        const snapshot = snapshotParallelProgress(context.sessionID);
        return withTodoRefreshReminder(
            await progress(
                {
                    ...args,
                    ...(!snapshot.reviewLanes && snapshot.reviewFanout
                        ? { reviewFanout: snapshot.reviewFanout }
                        : {}),
                    implementerDispatches: snapshot.implementerDispatches ?? [],
                },
                {
                    getApplyInstructions: change => getApplyInstructions(change, context.directory),
                },
            ),
            context,
        );
    },
});
