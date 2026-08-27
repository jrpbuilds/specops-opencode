import { describe, expect, test } from "bun:test";
import {
    assertNoExtraFields,
    assertShape,
    OpenSpecShapeError,
    type Schema,
} from "../../src/openspec/validation.js";

const schema: Schema = {
    name: { kind: "string", required: true },
    enabled: { kind: "boolean", required: true },
    count: { kind: "number", required: true },
    tags: { kind: "stringArray", required: true },
    nested: {
        kind: "record",
        required: true,
        schema: { label: { kind: "string", required: true } },
    },
    artifact: { kind: "artifact", required: true },
    optional: { kind: "string", required: false },
};

const validValue = {
    name: "example",
    enabled: true,
    count: 2,
    tags: ["one"],
    nested: { label: "nested" },
    artifact: { id: "proposal", outputPath: "proposal.md", status: "done", requires: [] },
};

describe("OpenSpec response validator", () => {
    test("accepts complete and optional-absent records", () => {
        expect(() => assertShape(validValue, schema, "openspec fixture")).not.toThrow();
    });

    test("rejects missing required fields and names the field", () => {
        const { name: _name, ...missing } = validValue;
        expect(() => assertShape(missing, schema, "openspec fixture")).toThrow(
            'openspec fixture: field "name" expected string, got undefined',
        );
    });

    test.each([
        ["name", 1, "string", "number"],
        ["enabled", "yes", "boolean", "string"],
        ["count", "two", "number", "string"],
        ["tags", [1], "stringArray", "array"],
    ] as const)("rejects wrong %s kind", (field, value, expected, observed) => {
        expect(() =>
            assertShape({ ...validValue, [field]: value }, schema, "openspec fixture"),
        ).toThrow(`expected ${expected}, got ${observed}`);
    });

    test("recurses into nested records", () => {
        expect(() =>
            assertShape({ ...validValue, nested: {} }, schema, "openspec fixture"),
        ).toThrow('openspec fixture.nested: field "label"');
    });

    test("validates artifact fields through the shared artifact guard", () => {
        expect(() =>
            assertShape({ ...validValue, artifact: { id: "bad" } }, schema, "openspec fixture"),
        ).toThrow('field "artifact" expected artifact');
    });

    test("ignores unknown fields by default, including nested records", () => {
        expect(() =>
            assertShape(
                { ...validValue, extra: true, nested: { label: "nested", extra: true } },
                schema,
                "openspec fixture",
            ),
        ).not.toThrow();
    });

    test("rejects unexpected fields when explicitly opted in", () => {
        expect(() =>
            assertNoExtraFields({ ...validValue, extra: true }, schema, "openspec fixture"),
        ).toThrow(OpenSpecShapeError);
        expect(() =>
            assertNoExtraFields({ ...validValue, extra: true }, schema, "openspec fixture"),
        ).toThrow("extra");
        expect(() =>
            assertNoExtraFields({ ...validValue, extra: true }, schema, "openspec fixture"),
        ).toThrow("not declared for openspec fixture");
    });

    test("rejects non-record responses", () => {
        expect(() => assertShape([], schema, "openspec fixture")).toThrow(
            "expected record, got array",
        );
    });
});

const arraySchema: Schema = {
    steps: {
        kind: "array",
        required: true,
        arrayItem: {
            kind: "record",
            required: true,
            schema: { label: { kind: "string", required: true } },
        },
    },
    artifacts: {
        kind: "array",
        required: false,
        arrayItem: { kind: "artifact", required: true },
    },
};

describe("array field specs", () => {
    test("accepts a valid array of records and an omitted optional array", () => {
        expect(() =>
            assertShape(
                { steps: [{ label: "one" }, { label: "two" }] },
                arraySchema,
                "openspec fixture",
            ),
        ).not.toThrow();
    });

    test("rejects a non-array value with the array expectation", () => {
        expect(() => assertShape({ steps: "one" }, arraySchema, "openspec fixture")).toThrow(
            'openspec fixture: field "steps" expected array, got string',
        );
    });

    test("recurses into arrayItem record schemas", () => {
        expect(() =>
            assertShape({ steps: [{ label: "ok" }, {}] }, arraySchema, "openspec fixture"),
        ).toThrow('openspec fixture.steps[].steps: field "label"');
    });

    test("rejects array items violating the item kind", () => {
        expect(() =>
            assertShape({ steps: ["not-a-record"] }, arraySchema, "openspec fixture"),
        ).toThrow('openspec fixture.steps[]: field "steps" expected record, got string');
    });

    test("validates artifact items through the shared artifact guard", () => {
        expect(() =>
            assertShape(
                {
                    steps: [],
                    artifacts: [
                        { id: "proposal", outputPath: "proposal.md", status: "done", requires: [] },
                    ],
                },
                arraySchema,
                "openspec fixture",
            ),
        ).not.toThrow();
        expect(() =>
            assertShape({ steps: [], artifacts: [{ id: "bad" }] }, arraySchema, "openspec fixture"),
        ).toThrow('field "artifacts" expected artifact');
    });
});
