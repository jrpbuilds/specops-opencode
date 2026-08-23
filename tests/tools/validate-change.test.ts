import type { ToolContext } from "@opencode-ai/plugin/tool";
import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import * as helpers from "../../src/helpers.js";
import { validateChange, type ValidateChangeDeps } from "../../src/tools/validate-change.js";
import { validateChangeTool } from "../../src/host/tools/validate-change.js";

afterEach(() => {
    mock.restore();
});

const validResponse = {
    items: [{ id: "example", type: "change", valid: true, issues: [], durationMs: 2 }],
    summary: { totals: { items: 1, passed: 1, failed: 0 }, byType: {} },
    version: "1.0",
    root: { path: "/project", source: "nearest" },
};

function context(): ToolContext {
    return {
        sessionID: "test-session",
        messageID: "test-message",
        agent: "SpecOps",
        directory: "/project",
        worktree: "/project",
        abort: new AbortController().signal,
        ask: async () => {},
        metadata: () => {},
    };
}

function deps(
    result: Awaited<ReturnType<ValidateChangeDeps["validateChange"]>>,
): ValidateChangeDeps {
    return { validateChange: async () => result };
}

function outputOf(result: Awaited<ReturnType<typeof validateChangeTool.execute>>): string {
    return typeof result === "string" ? result : result.output;
}

describe("validateChange tool adapter", () => {
    test("returns a structured success result", async () => {
        await expect(
            validateChange("  example  ", deps({ valid: true, issues: [] })),
        ).resolves.toEqual({
            valid: true,
            issues: [],
        });
    });

    test("returns violations and actionable remediation on failure", async () => {
        const issues = [{ level: "error", path: "tasks.md", message: "missing checkbox" }];
        const result = await validateChange("example", deps({ valid: false, issues }));
        expect(result).toMatchObject({ valid: false, issues });
        if (!result.valid) {
            expect(result.remediation).toContain("OPENSPEC_VALIDATION_FAILED");
            expect(result.remediation).toContain("tasks.md: missing checkbox");
            expect(result.remediation).toContain("openspec validate example --strict");
        }
    });

    test("uses the positional strict validation invocation", async () => {
        let invocation: { command: string; args: string[]; cwd?: string } | undefined;
        spyOn(helpers, "runCaptureStdout").mockImplementation(async (command, args, cwd) => {
            invocation = { command, args, cwd };
            return { stdout: JSON.stringify(validResponse), exitCode: 0 };
        });

        const result = await validateChangeTool.execute({ change: "example" }, context());
        expect(JSON.parse(outputOf(result))).toEqual({ valid: true, issues: [] });
        expect(invocation).toEqual({
            command: "openspec",
            args: ["validate", "example", "--strict", "--json"],
            cwd: "/project",
        });
    });

    test("rejects arguments outside the exact change-only contract", async () => {
        for (const args of [
            {},
            { change: "example", all: true },
            { change: "example", changes: true },
            { change: 42 },
            ["example"],
        ]) {
            await expect(validateChangeTool.execute(args as never, context())).rejects.toThrow(
                "expects exactly {change: string}",
            );
        }
    });

    test("renders a structured failure from the real validation wrapper", async () => {
        const failedResponse = {
            ...validResponse,
            items: [
                {
                    ...validResponse.items[0],
                    valid: false,
                    issues: [{ level: "error", path: "proposal.md", message: "invalid" }],
                },
            ],
        };
        spyOn(helpers, "runCaptureStdout").mockResolvedValue({
            stdout: JSON.stringify(failedResponse),
            exitCode: 1,
        });

        const result = JSON.parse(
            outputOf(await validateChangeTool.execute({ change: "example" }, context())),
        );
        expect(result.valid).toBe(false);
        expect(result.issues).toEqual([
            { level: "error", path: "proposal.md", message: "invalid" },
        ]);
        expect(result.remediation).toContain("OPENSPEC_VALIDATION_FAILED");
    });
});
