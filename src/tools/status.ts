import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool";
import { getOpenSpecStatus, type OpenSpecStatusResult } from "../openspec/status.js";
import { requireLifecyclePermission } from "./lifecycle-permission.js";

/** Dependency boundary for the deterministic OpenSpec status tool. */
export type StatusDeps = {
    getOpenSpecStatus: (change: string) => Promise<OpenSpecStatusResult>;
};

/** Return normalized OpenSpec workflow facts for one named change. */
export async function status(change: string, deps: StatusDeps): Promise<string> {
    const name = change.trim();
    if (!name) return "An OpenSpec change name is required.";

    const result = await deps.getOpenSpecStatus(name);
    if (!result.ok) {
        return `Failed to read OpenSpec status for '${name}': ${result.error}`;
    }
    return JSON.stringify(result.status, null, 2);
}

/** Expose authoritative OpenSpec status through the coordinator-only tool surface. */
export const statusTool: ToolDefinition = tool({
    description: "Read normalized OpenSpec workflow status for a named change.",
    args: {
        change: tool.schema.string(),
    },
    async execute(args, context) {
        await requireLifecyclePermission(context, "specops_status");
        context.metadata({ title: "Reading OpenSpec status…" });
        return status(args.change, {
            getOpenSpecStatus: change => getOpenSpecStatus(change, context.directory),
        });
    },
});
