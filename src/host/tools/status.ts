import { tool } from "@opencode-ai/plugin/tool";
import { getApplyInstructions } from "../../openspec/apply-instructions.js";
import { getOpenSpecStatus } from "../../openspec/status.js";
import { status } from "../../tools/status.js";
import { requireLifecyclePermission } from "../lifecycle-permission.js";
import { recordSessionBinding } from "../session-bindings.js";

/**
 * Expose authoritative OpenSpec status through the coordinator-only tool surface.
 *
 * The session directory is supplied by OpenCode so status targets the current
 * project rather than the process working directory. Both durable reads feed
 * the deterministic phase, lifecycle, and eligible-action derivations in the
 * tool core.
 */
export const statusTool = tool({
    description:
        "Read normalized OpenSpec workflow status for a named change, including the current " +
        "workflow phase, whether implementation and review are legally available, and the " +
        "actions that are legal right now.",
    args: {
        change: tool.schema.string(),
    },
    async execute(args, context) {
        await requireLifecyclePermission(context, "specops_status");
        recordSessionBinding(context.sessionID, context.agent, args.change);
        context.metadata({ title: "Reading OpenSpec status…" });
        return status(args.change, {
            getOpenSpecStatus: change => getOpenSpecStatus(change, context.directory),
            getApplyInstructions: change => getApplyInstructions(change, context.directory),
        });
    },
});
