import { runCaptureStdout } from "../helpers.js";
import type { CaptureStdout } from "./helpers.js";
import { formatCommandFailure, isRecord } from "./helpers.js";
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
    let result: { stdout: string; exitCode: number | null };
    try {
        result = await capture("openspec", ["validate", changeName, "--strict", "--json"], cwd);
    } catch (error) {
        throw new Error(`Unable to run OpenSpec validate: ${errorMessage(error)}`);
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(result.stdout);
    } catch {
        throw new OpenSpecShapeError(
            "openspec validate",
            "response",
            "JSON object",
            result.stdout || "empty output",
        );
    }

    assertShape(parsed, responseSchema, "openspec validate");
    const validated = parsed as Record<string, unknown>;

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

/** Extract a message from an unknown thrown value. */
function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
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
    let result: { stdout: string; exitCode: number | null };
    try {
        result = await capture("openspec", ["validate", "--archived", "--json"], cwd);
    } catch (error) {
        throw new Error(`Unable to run OpenSpec validate: ${errorMessage(error)}`);
    }

    if (result.exitCode === null) {
        throw new Error("OpenSpec validate --archived was terminated before returning a result");
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(result.stdout);
    } catch {
        throw new OpenSpecShapeError(
            "openspec validate",
            "response",
            "JSON object",
            result.stdout || "empty output",
        );
    }

    // A non-zero exit with a status envelope is a command failure, not an
    // invalid-archives verdict; surface the envelope's message and fix.
    if (result.exitCode !== 0 && isRecord(parsed) && Array.isArray(parsed.status)) {
        throw new Error(formatCommandFailure(parsed, result.exitCode, "validate"));
    }

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
