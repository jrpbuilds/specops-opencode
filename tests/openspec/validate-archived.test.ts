import { describe, expect, test } from "bun:test";
import { validateArchived } from "../../src/openspec/validate.js";
import type { CaptureStdout } from "../../src/openspec/helpers.js";
import { OpenSpecShapeError } from "../../src/openspec/validation.js";

const response = {
    items: [
        {
            id: "archived-change",
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

describe("validateArchived", () => {
    test("runs openspec validate --archived --json and reduces a passing response", async () => {
        const calls: string[][] = [];
        const result = await validateArchived("/project", captureJson(response, 0, calls));
        expect(calls).toEqual([["openspec", "validate", "--archived", "--json"]]);
        expect(result).toEqual({ valid: true, issues: [] });
    });

    test("treats a successful response without an items field as an empty healthy archive", async () => {
        const calls: string[][] = [];
        const empty = {
            summary: { totals: { items: 0, passed: 0, failed: 0 }, byType: {} },
            version: "1.0",
            root: { path: "/project", source: "nearest" },
        };

        const result = await validateArchived("/project", captureJson(empty, 0, calls));
        expect(calls).toEqual([["openspec", "validate", "--archived", "--json"]]);
        expect(result).toEqual({ valid: true, issues: [] });
    });

    test("surfaces invalid archived item issues with the owning item id", async () => {
        const invalid = {
            ...response,
            items: [
                {
                    ...response.items[0],
                    valid: false,
                    issues: [{ level: "error", path: "proposal.md", message: "missing why" }],
                },
            ],
        };

        expect(await validateArchived("/project", captureJson(invalid))).toEqual({
            valid: false,
            issues: [
                {
                    itemId: "archived-change",
                    level: "error",
                    path: "proposal.md",
                    message: "missing why",
                },
            ],
        });
    });

    test("treats a non-zero exit with a valid envelope as invalid", async () => {
        expect((await validateArchived("/project", captureJson(response, 1))).valid).toBe(false);
    });

    test("throws the failure envelope message and fix on a non-zero exit", async () => {
        const envelope = {
            status: [{ message: "archived validation failed", fix: "run archive again" }],
        };
        const capture = captureJson(envelope, 1);

        await expect(validateArchived("/project", capture)).rejects.toThrow(
            "archived validation failed",
        );
        await expect(validateArchived("/project", capture)).rejects.toThrow(
            "Fix: run archive again",
        );
    });

    test("throws when the process is terminated before returning a result", async () => {
        await expect(
            validateArchived("/project", async () => ({ stdout: "", exitCode: null })),
        ).rejects.toThrow("OpenSpec validate --archived was terminated before returning a result");
    });

    test("rejects malformed JSON and wrong shapes", async () => {
        await expect(
            validateArchived("/project", async () => ({ stdout: "not json", exitCode: 0 })),
        ).rejects.toBeInstanceOf(OpenSpecShapeError);
        await expect(
            validateArchived("/project", captureJson({ ...response, items: "bad" })),
        ).rejects.toBeInstanceOf(OpenSpecShapeError);
    });

    test("throws Unable to run OpenSpec validate on spawn rejection", async () => {
        await expect(
            validateArchived("/project", async () => {
                throw new Error("spawn openspec ENOENT");
            }),
        ).rejects.toThrow("Unable to run OpenSpec validate: spawn openspec ENOENT");
    });

    test("accepts unknown summary fields as forward-compatible", async () => {
        const extended = {
            ...response,
            summary: { ...response.summary, unexpected: true },
        };

        await expect(validateArchived("/project", captureJson(extended))).resolves.toEqual({
            valid: true,
            issues: [],
        });
    });
});
