import { describe, expect, test } from "bun:test";
import { countChangeDeltas } from "../../src/openspec/deltas.js";
import type { CaptureStdout } from "../../src/openspec/helpers.js";
import { OpenSpecShapeError } from "../../src/openspec/validation.js";

const response = {
    id: "example",
    title: "Example",
    deltaCount: 1,
    deltas: [
        {
            spec: "example-capability",
            operation: "ADDED",
            requirement: { text: "The system SHALL demonstrate a parsed delta." },
        },
    ],
    root: { path: "/project", source: "nearest" },
};

function captureJson(value: unknown, exitCode = 0, received?: string[][]): CaptureStdout {
    return async (command, args) => {
        received?.push([command, ...args]);
        return { stdout: JSON.stringify(value), exitCode };
    };
}

describe("countChangeDeltas", () => {
    test("uses the positional deltas-only invocation and counts parsed deltas", async () => {
        const calls: string[][] = [];
        const count = await countChangeDeltas(
            "example",
            "/project",
            captureJson(response, 0, calls),
        );
        expect(calls).toEqual([["openspec", "show", "example", "--json", "--deltas-only"]]);
        expect(count).toBe(1);
    });

    test("reports zero for a change without capability specifications", async () => {
        const empty = { ...response, deltaCount: 0, deltas: [] };
        expect(await countChangeDeltas("example", "/project", captureJson(empty))).toBe(0);
    });

    test("reports zero before the first proposal exists", async () => {
        const missingProposal = {
            status: [
                {
                    severity: "error",
                    code: "show_error",
                    message: 'Change "example" has no proposal.md yet.',
                },
            ],
        };
        expect(
            await countChangeDeltas("example", "/project", captureJson(missingProposal, 1)),
        ).toBe(0);
    });

    test("accepts unknown envelope fields and opaque delta entries as forward-compatible", async () => {
        const forward = {
            ...response,
            unexpected: true,
            deltas: [{ anything: { nested: true } }],
        };
        expect(await countChangeDeltas("example", "/project", captureJson(forward))).toBe(1);
    });

    test("rejects malformed JSON and wrong shapes", async () => {
        await expect(
            countChangeDeltas("example", "/project", async () => ({
                stdout: "not json",
                exitCode: 0,
            })),
        ).rejects.toBeInstanceOf(OpenSpecShapeError);
        await expect(
            countChangeDeltas("example", "/project", captureJson({ ...response, id: 42 })),
        ).rejects.toBeInstanceOf(OpenSpecShapeError);
        await expect(
            countChangeDeltas("example", "/project", captureJson({ ...response, deltas: "bad" })),
        ).rejects.toBeInstanceOf(OpenSpecShapeError);
        await expect(
            countChangeDeltas("example", "/project", captureJson({ ...response, deltas: ["bad"] })),
        ).rejects.toBeInstanceOf(OpenSpecShapeError);
    });

    test("wraps spawn failures as unable-to-run errors", async () => {
        await expect(
            countChangeDeltas("example", "/project", async () => {
                throw new Error("spawn failure");
            }),
        ).rejects.toThrow("Unable to run OpenSpec show: spawn failure");
    });
});
