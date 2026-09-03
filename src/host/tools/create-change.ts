import { tool } from "@opencode-ai/plugin/tool";
import { createOpenSpecChange } from "../../openspec/create-change.js";
import { createChange } from "../../tools/create-change.js";
import { requireLifecyclePermission } from "../lifecycle-permission.js";
import { recordSessionBinding } from "../session-bindings.js";

/** Expose native OpenSpec change creation through the SpecOps tool surface. */
export const createChangeTool = tool({
    description: "Create a named OpenSpec change using the native OpenSpec creation operation.",
    args: {
        change: tool.schema.string(),
        goal: tool.schema.string().optional(),
    },
    async execute(args, toolContext) {
        await requireLifecyclePermission(toolContext, "specops_create_change");
        recordSessionBinding(toolContext.sessionID, toolContext.agent, args.change);
        toolContext.metadata({ title: "Creating OpenSpec change…" });
        return createChange(args.change, args.goal, {
            createChange: (change, goal) =>
                createOpenSpecChange(change, toolContext.directory, goal),
        });
    },
});
