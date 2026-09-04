import { tool } from "@opencode-ai/plugin/tool";
import { getApplyInstructions } from "../../openspec/apply-instructions.js";
import { applyInstructions } from "../../tools/apply-instructions.js";
import { requireLifecyclePermission } from "../lifecycle-permission.js";
import { recordSessionBinding } from "../session-bindings.js";
import { withTodoRefreshReminder } from "./todo-refresh.js";

/** Expose canonical OpenSpec apply instructions through the coordinator-only tool surface. */
export const applyInstructionsTool = tool({
    description: "Read normalized OpenSpec apply instructions for a named change.",
    args: {
        change: tool.schema.string(),
    },
    async execute(args, context) {
        await requireLifecyclePermission(context, "specops_apply_instructions");
        recordSessionBinding(context.sessionID, context.agent, args.change);
        context.metadata({ title: "Reading OpenSpec apply instructions…" });
        const output = await applyInstructions(args.change, {
            getApplyInstructions: change => getApplyInstructions(change, context.directory),
        });
        return withTodoRefreshReminder(output);
    },
});
