import { describe, expect, test } from "bun:test";
import { validateChange } from "../../src/openspec/validate.js";
import type { CaptureStdout } from "../../src/openspec/helpers.js";
import { OpenSpecShapeError } from "../../src/openspec/validation.js";

const response = {
    items: [
        {
            id: "example",
            type: "change",
            valid: true,
            issues: [],
            durationMs: 5,
        },
    ],
    summary: { totals: { items: 1, passed: 1, failed: 0 }, byType: {} },
    version: "1.0",
    root: { path: "/project", source: "nearest" },
};

function captureJson(value: unknown, exitCode = 0, received?: string[][]): CaptureStdout {
    return async (command, args) => {
        received?.push([command, ...args]);
        return { stdout: JSON.stringify(value), exitCode };
    };
}

describe("validateChange", () => {
    test("uses positional scoped validation and reduces a passing response", async () => {
        const calls: string[][] = [];
        const result = await validateChange("example", "/project", captureJson(response, 0, calls));
        expect(calls).toEqual([["openspec", "validate", "example", "--strict", "--json"]]);
        expect(result).toEqual({ valid: true, issues: [] });
    });

    test("surfaces item violations and invalidates the change", async () => {
        const invalid = {
            ...response,
            items: [
                {
                    ...response.items[0],
                    valid: false,
                    issues: [{ level: "error", path: "tasks.md", message: "missing checkbox" }],
                },
            ],
        };
        expect(await validateChange("example", "/project", captureJson(invalid))).toEqual({
            valid: false,
            issues: [{ level: "error", path: "tasks.md", message: "missing checkbox" }],
        });
    });

    test("treats a non-zero exit as invalid", async () => {
        expect((await validateChange("example", "/project", captureJson(response, 1))).valid).toBe(
            false,
        );
    });

    test("rejects malformed JSON and wrong shapes", async () => {
        await expect(
            validateChange("example", "/project", async () => ({
                stdout: "not json",
                exitCode: 0,
            })),
        ).rejects.toBeInstanceOf(OpenSpecShapeError);
        await expect(
            validateChange("example", "/project", captureJson({ ...response, items: "bad" })),
        ).rejects.toBeInstanceOf(OpenSpecShapeError);
    });

    test("rejects unexpected summary fields", async () => {
        const invalid = {
            ...response,
            summary: { ...response.summary, unexpected: true },
        };

        await expect(
            validateChange("example", "/project", captureJson(invalid)),
        ).rejects.toMatchObject({
            code: "OPENSPEC_MALFORMED_RESPONSE",
            field: "unexpected",
        });
    });

    test("rejects incomplete summary totals", async () => {
        const invalid = {
            ...response,
            summary: {
                ...response.summary,
                totals: { items: 1, passed: 1 },
            },
        };

        await expect(
            validateChange("example", "/project", captureJson(invalid)),
        ).rejects.toMatchObject({
            code: "OPENSPEC_MALFORMED_RESPONSE",
            field: "failed",
        });
    });
});
