import { runCaptureStdout } from "../helpers.js";
import type { CaptureStdout } from "./helpers.js";
import { runOpenSpecJson } from "./exec.js";
import { isRecord } from "./helpers.js";
import { assertShape, OpenSpecShapeError, type Schema } from "./validation.js";

/**
 * Validates the `openspec show <change> --json --deltas-only` envelope.
 *
 * Delta entries are OpenSpec-owned and evolve independently, so only their
 * record-ness is asserted; `id` anchors the response to a change payload.
 */
const responseSchema: Schema = {
    id: { kind: "string", required: true },
    deltas: {
        kind: "array",
        required: true,
        arrayItem: { kind: "record", required: true },
    },
};

/**
 * Count the parsed requirement deltas of one named OpenSpec change.
 *
 * A count of zero means strict validation can only fail with "no deltas
 * found", which distinguishes mid-planning changes from genuinely invalid
 * ones. A newly-created change has no proposal yet, so OpenSpec reports that
 * state as a non-zero `show` response; it is also an empty delta set. Throws
 * on spawn failure or a malformed CLI response.
 */
export async function countChangeDeltas(
    changeName: string,
    cwd?: string,
    capture: CaptureStdout = runCaptureStdout,
): Promise<number> {
    const result = await runOpenSpecJson("show", ["show", changeName, "--json", "--deltas-only"], {
        cwd,
        capture,
        nonZero: "passthrough",
    });
    if (result.kind === "spawn") throw new Error(result.message);
    if (result.kind === "invalidJson" || result.kind === "terminated") {
        throw new OpenSpecShapeError(
            "openspec show",
            "response",
            "JSON object",
            result.stdout || "empty output",
        );
    }
    if (result.kind !== "success") throw new Error(result.message);
    if (result.exitCode !== 0 && isMissingProposalResponse(result.parsed)) return 0;

    assertShape(result.parsed, responseSchema, "openspec show");
    const validated = result.parsed as Record<string, unknown>;
    return (validated.deltas as unknown[]).length;
}

/** Recognize the expected response for a change before its first artifact exists. */
function isMissingProposalResponse(value: unknown): boolean {
    if (!isRecord(value) || !Array.isArray(value.status)) return false;
    return value.status.some(
        status =>
            isRecord(status) &&
            status.code === "show_error" &&
            typeof status.message === "string" &&
            status.message.includes("has no proposal.md yet"),
    );
}
