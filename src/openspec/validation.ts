import { formatRemediation } from "./remediation.js";
import { isNormalizedArtifact, isRecord } from "./helpers.js";

export type FieldKind = "string" | "boolean" | "number" | "stringArray" | "record" | "artifact";

export type FieldSpec = {
    kind: FieldKind;
    required: boolean;
    schema?: Schema;
    nullable?: boolean;
};

export type Schema = Record<string, FieldSpec>;

/** Error thrown when an OpenSpec response violates a wrapper contract. */
export class OpenSpecShapeError extends Error {
    readonly code = "OPENSPEC_MALFORMED_RESPONSE" as const;
    readonly remediation: string;

    constructor(
        readonly wrapper: string,
        readonly field: string,
        readonly expected: string,
        readonly observed: string,
    ) {
        const message = `${wrapper}: field "${field}" expected ${expected}, got ${observed}`;
        super(
            `${message}\n${formatRemediation("OPENSPEC_MALFORMED_RESPONSE", {
                wrapper,
                field,
                expected,
                observed,
            })}`,
        );
        this.name = "OpenSpecShapeError";
        this.remediation = formatRemediation("OPENSPEC_MALFORMED_RESPONSE", {
            wrapper,
            field,
            expected,
            observed,
        });
    }
}

/** Assert the required fields and value kinds of one OpenSpec response. */
export function assertShape(value: unknown, schema: Schema, ctx: string): void {
    if (!isRecord(value)) {
        throw new OpenSpecShapeError(ctx, "response", "record", describeValue(value));
    }

    for (const [field, spec] of Object.entries(schema)) {
        const present = Object.prototype.hasOwnProperty.call(value, field);
        if (!present && spec.required) {
            throw new OpenSpecShapeError(ctx, field, spec.kind, "undefined");
        }
        if (present) assertField(value[field], field, spec, ctx);
    }
}

/**
 * Reject response fields that are outside the wrapper's declared contract.
 *
 * This is opt-in and default-off: call it explicitly only where an unknown
 * field would be unsafe, and record any future opt-in as a decision in its
 * own change.
 */
export function assertNoExtraFields(
    value: Record<string, unknown>,
    schema: Schema,
    ctx: string,
): void {
    for (const field of Object.keys(value)) {
        if (!(field in schema)) {
            throw new OpenSpecShapeError(
                ctx,
                field,
                `a field declared for ${ctx}`,
                `${describeValue(value[field])} (not declared for ${ctx})`,
            );
        }
    }
}

function assertField(value: unknown, field: string, spec: FieldSpec, ctx: string): void {
    if (value === null && spec.nullable) return;
    const arrayItem = (spec as FieldSpec & { arrayItem?: FieldSpec }).arrayItem;
    if (arrayItem) {
        if (!Array.isArray(value)) {
            throw new OpenSpecShapeError(ctx, field, "array", describeValue(value));
        }
        for (const item of value) assertField(item, field, arrayItem, `${ctx}.${field}[]`);
        return;
    }
    const valid = matchesKind(value, spec);
    if (!valid) {
        throw new OpenSpecShapeError(ctx, field, spec.kind, describeValue(value));
    }
    if (spec.kind === "record" && spec.schema) {
        assertShape(value, spec.schema, `${ctx}.${field}`);
    }
}

function matchesKind(value: unknown, spec: FieldSpec): boolean {
    switch (spec.kind) {
        case "string":
            return typeof value === "string";
        case "boolean":
            return typeof value === "boolean";
        case "number":
            return typeof value === "number" && Number.isFinite(value);
        case "stringArray":
            return Array.isArray(value) && value.every(item => typeof item === "string");
        case "record":
            return isRecord(value);
        case "artifact":
            return isRecord(value) && isNormalizedArtifact(value);
    }
}

function describeValue(value: unknown): string {
    if (value === undefined) return "undefined";
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    return typeof value;
}
