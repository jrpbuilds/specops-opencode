import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool";
import { archiveChange, type OpenSpecArchiveResult } from "../openspec/archive.js";

/**
 * Dependencies for the deterministic archive operation.
 *
 * The OpenSpec call is injected so the tool's input handling and result
 * formatting can be tested without starting a real CLI process. Keeping this
 * boundary small also prevents the tool from acquiring workflow policy.
 */
export type ArchiveDeps = {
    archiveChange: (change: string) => Promise<OpenSpecArchiveResult>;
};

/**
 * Request the native archive operation for one named OpenSpec change.
 *
 * The name is trimmed and rejected when empty, then passed to the injected
 * OpenSpec operation. This function does not inspect review state, validate
 * tasks, retry failures, or add lifecycle state; those decisions belong to
 * the Coordinator and OpenSpec itself.
 *
 * @param change The active OpenSpec change name to archive.
 * @param deps The deterministic OpenSpec operation used to perform the archive.
 * @returns A concise success or failure message suitable for a tool result.
 */
export async function archive(change: string, deps: ArchiveDeps): Promise<string> {
    const name = change.trim();
    if (!name) return "An OpenSpec change name is required.";

    const result = await deps.archiveChange(name);
    if (!result.ok) {
        return `Failed to archive OpenSpec change '${name}': ${result.error}`;
    }
    return `OpenSpec change '${name}' archived successfully as '${result.archivedAs}' at ${result.path}.`;
}

/**
 * Expose native OpenSpec archiving through the SpecOps tool surface.
 *
 * The session directory is supplied by OpenCode so archiving targets the
 * current project rather than the process working directory.
 */
export const archiveTool: ToolDefinition = tool({
    description: "Archive a named OpenSpec change using the native OpenSpec archive operation.",
    args: {
        change: tool.schema.string(),
    },
    async execute(args, context) {
        context.metadata({ title: "Archiving OpenSpec change…" });
        return archive(args.change, {
            archiveChange: change => archiveChange(change, context.directory),
        });
    },
});
