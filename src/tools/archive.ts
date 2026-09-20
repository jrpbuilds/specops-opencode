import type { OpenSpecArchiveResult } from "../openspec/archive.js";

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

/** Structured archive outcome consumed by the host tool wrapper. */
export type ArchiveOutcome = {
    /** Whether OpenSpec archived the change. */
    readonly ok: boolean;
    /** The user-facing result message. */
    readonly message: string;
};

/**
 * Request the native archive operation for one named OpenSpec change.
 *
 * The name is trimmed and rejected when empty, then passed to the injected
 * OpenSpec operation. This function does not inspect review state, validate
 * tasks, retry failures, or add lifecycle state; those decisions belong to
 * the Orchestrator and OpenSpec itself. Because a passed review is not durable
 * OpenSpec state, this tool boundary can never prove archiving is legal —
 * the passed-review-before-archive invariant stays orchestrator-owned.
 *
 * The outcome is structured so the host wrapper can observe a successful
 * archive (finalizing the Todo projection's terminal state) without parsing
 * the message text.
 *
 * @param change The active OpenSpec change name to archive.
 * @param deps The deterministic OpenSpec operation used to perform the archive.
 * @returns A structured success or failure outcome with a concise message.
 */
export async function archive(change: string, deps: ArchiveDeps): Promise<ArchiveOutcome> {
    const name = change.trim();
    if (!name) return { ok: false, message: "An OpenSpec change name is required." };

    const result = await deps.archiveChange(name);
    if (!result.ok) {
        return {
            ok: false,
            message: `Failed to archive OpenSpec change '${name}': ${result.error}`,
        };
    }
    return {
        ok: true,
        message: `OpenSpec change '${name}' archived successfully as '${result.archivedAs}' at ${result.path}.`,
    };
}
