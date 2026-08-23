import { runCaptureStdout } from "../helpers.js";
import type { CaptureStdout } from "./helpers.js";
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
