import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool";
import {
    createOpenSpecChange,
    type OpenSpecCreateChangeResult,
} from "../openspec/create-change.js";

/** Dependency boundary for deterministic OpenSpec change creation. */
export type CreateChangeDeps = {
    createChange: (change: string, goal?: string) => Promise<OpenSpecCreateChangeResult>;
};

/**
 * Request creation of one named OpenSpec change.
 *
 * This validates only the required input and leaves name rules and workflow
 * policy to OpenSpec and the Coordinator respectively.
 */
export async function createChange(
    change: string,
    goal: string | undefined,
    deps: CreateChangeDeps,
): Promise<string> {
    const name = change.trim();
    if (!name) return "An OpenSpec change name is required.";

    const trimmedGoal = goal?.trim();
    const result = await deps.createChange(name, trimmedGoal || undefined);
    if (!result.ok) return `Failed to create OpenSpec change '${name}': ${result.error}`;
    return `OpenSpec change '${result.name}' created successfully at ${result.path}.`;
}

/** Expose native OpenSpec change creation through the SpecOps tool surface. */
export const createChangeTool: ToolDefinition = tool({
    description: "Create a named OpenSpec change using the native OpenSpec creation operation.",
    args: {
        change: tool.schema.string(),
        goal: tool.schema.string().optional(),
    },
    async execute(args, toolContext) {
        toolContext.metadata({ title: "Creating OpenSpec change…" });
        return createChange(args.change, args.goal, {
            createChange: (change, goal) =>
                createOpenSpecChange(change, toolContext.directory, goal),
        });
    },
});
