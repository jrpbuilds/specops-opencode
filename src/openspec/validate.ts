import { runCaptureStdout } from "../helpers.js";
import type { CaptureStdout } from "./helpers.js";
import { isRecord } from "./helpers.js";
import { runOpenSpecJson } from "./exec.js";
import { assertShape, OpenSpecShapeError, type Schema } from "./validation.js";

/** Scoped strict-validation outcome for one named change. */
export type ChangeValidation = {
    valid: boolean;
    issues: { level: string; path: string; message: string }[];
};

/** Validates one scoped issue entry from `openspec validate --strict --json`. */
const issueSchema: Schema = {
    level: { kind: "string", required: true },
    path: { kind: "string", required: true },
    message: { kind: "string", required: true },
};

/** Validates one validated-item entry from `openspec validate --strict --json`. */
const itemSchema: Schema = {
    id: { kind: "string", required: true },
    type: { kind: "string", required: true },
    valid: { kind: "boolean", required: true },
    issues: {
        kind: "record",
        required: true,
        arrayItem: { kind: "record", required: true, schema: issueSchema },
    } as never,
    durationMs: { kind: "number", required: true },
};

/** Validates the totals summary of `openspec validate --strict --json`. */
const summarySchema: Schema = {
    totals: {
        kind: "record",
        required: true,
        schema: {
            items: { kind: "number", required: true },
            passed: { kind: "number", required: true },
            failed: { kind: "number", required: true },
        },
    },
    // byType is an OpenSpec-owned dynamic map keyed by item type.
    byType: { kind: "record", required: true },
};

/** Validates the full `openspec validate --strict --json` envelope. */
const responseSchema: Schema = {
    items: {
        kind: "record",
        required: true,
        arrayItem: { kind: "record", required: true, schema: itemSchema },
    } as never,
    summary: { kind: "record", required: true, schema: summarySchema },
    version: { kind: "string", required: true },
    root: {
        kind: "record",
        required: true,
        schema: {
            path: { kind: "string", required: true },
            source: { kind: "string", required: true },
        },
    },
};

/** Validate one named OpenSpec change using the positional item-name surface. */
export async function validateChange(
    changeName: string,
    cwd?: string,
    capture: CaptureStdout = runCaptureStdout,
): Promise<ChangeValidation> {
    const result = await runOpenSpecJson(
        "validate",
        ["validate", changeName, "--strict", "--json"],
        { cwd, capture, nonZero: "passthrough" },
    );
    if (result.kind === "spawn") throw new Error(result.message);
    if (result.kind === "invalidJson" || result.kind === "terminated") {
        throw new OpenSpecShapeError(
            "openspec validate",
            "response",
            "JSON object",
            result.stdout || "empty output",
        );
    }
    if (result.kind !== "success") throw new Error(result.message);

    assertShape(result.parsed, responseSchema, "openspec validate");
    const validated = result.parsed as Record<string, unknown>;

    const items = validated.items as Array<Record<string, unknown>>;
    const issues = items.flatMap(item => item.issues as Array<Record<string, string>>);
    return {
        valid: result.exitCode === 0 && items.every(item => item.valid === true),
        issues: issues.map(issue => ({
            level: issue.level,
            path: issue.path,
            message: issue.message,
        })),
    };
}

/** One archived-change issue, carrying the owning archived item's id. */
export type ArchivedIssue = {
    itemId: string; // archived change id (item.id)
    level: string;
    path: string;
    message: string;
};

/** Archived-surface validation outcome. Throws on any failure path. */
export type ArchivedValidation = {
    valid: boolean;
    issues: ArchivedIssue[];
};

/**
 * Validate the archived-change surface using OpenSpec's native command.
 *
 * Mirrors `validateChange`'s contract: returns a value on the valid/invalid
 * path and throws on every failure path (spawn rejection, termination,
 * malformed JSON, a non-zero exit with a `status` failure envelope, or a
 * response that violates the shared response shape).
 */
export async function validateArchived(
    cwd?: string,
    capture: CaptureStdout = runCaptureStdout,
): Promise<ArchivedValidation> {
    const result = await runOpenSpecJson("validate", ["validate", "--archived", "--json"], {
        cwd,
        capture,
        nonZero: "status-envelope",
        terminatedName: "validate --archived",
    });
    if (result.kind === "spawn" || result.kind === "nonZero") {
        throw new Error(result.message);
    }
    if (result.kind === "terminated") throw new Error(result.message);
    if (result.kind === "invalidJson") {
        throw new OpenSpecShapeError(
            "openspec validate",
            "response",
            "JSON object",
            result.stdout || "empty output",
        );
    }
    if (result.kind !== "success") throw new Error(result.message);

    const parsed = result.parsed;

    // OpenSpec omits the top-level `items` field entirely when the archive is
    // empty. A successful run with no items means "no archived changes to
    // validate", which is healthy; a present-but-malformed `items` still fails
    // the strict shape check below, and a non-zero exit is never treated as
    // healthy.
    if (result.exitCode === 0 && isRecord(parsed) && !("items" in parsed)) {
        return { valid: true, issues: [] };
    }

    assertShape(parsed, responseSchema, "openspec validate");
    const validated = parsed as Record<string, unknown>;

    const items = validated.items as Array<Record<string, unknown>>;
    const issues = items.flatMap(item =>
        (item.issues as Array<Record<string, string>>).map(issue => ({
            itemId: item.id as string,
            level: issue.level,
            path: issue.path,
            message: issue.message,
        })),
    );
    return {
        valid: result.exitCode === 0 && items.every(item => item.valid === true),
        issues,
    };
}
