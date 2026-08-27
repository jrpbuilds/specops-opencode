import { describe, expect, test } from "bun:test";
import { runOpenSpecJson, invalidResultMessage } from "../../src/openspec/exec.js";
import type { CaptureStdout } from "../../src/openspec/helpers.js";

function captureJson(value: unknown, exitCode: number | null = 0): CaptureStdout {
    return async () => ({ stdout: JSON.stringify(value), exitCode });
}

describe("runOpenSpecJson", () => {
    test("builds the stable invalid-result message", () => {
        expect(invalidResultMessage("status")).toBe("OpenSpec status returned an invalid result");
    });

    test("returns parsed JSON and numeric exit code on success", async () => {
        const invocation: { command: string; args: string[]; cwd?: string }[] = [];
        const capture: CaptureStdout = async (command, args, cwd) => {
            invocation.push({ command, args, cwd });
            return { stdout: JSON.stringify({ result: "ok" }), exitCode: 0 };
        };

        await expect(
            runOpenSpecJson("status", ["status", "--json"], { cwd: "/project", capture }),
        ).resolves.toEqual({ kind: "success", parsed: { result: "ok" }, exitCode: 0 });
        expect(invocation).toEqual([
            { command: "openspec", args: ["status", "--json"], cwd: "/project" },
        ]);
    });

    test("classifies spawn rejection and carries the raw error", async () => {
        const error = new Error("spawn openspec ENOENT");
        const capture: CaptureStdout = async () => {
            throw error;
        };

        await expect(runOpenSpecJson("status", [], { cwd: "/project", capture })).resolves.toEqual({
            kind: "spawn",
            message: "Unable to run OpenSpec status: spawn openspec ENOENT",
            error,
        });
    });

    test("classifies termination and preserves stdout", async () => {
        await expect(
            runOpenSpecJson("status", [], {
                cwd: "/project",
                capture: captureJson({ ok: true }, null),
            }),
        ).resolves.toEqual({
            kind: "terminated",
            message: "OpenSpec status was terminated before returning a result",
            stdout: '{"ok":true}',
        });
    });

    test("uses terminatedName only for the termination message", async () => {
        await expect(
            runOpenSpecJson("validate", [], {
                cwd: "/project",
                terminatedName: "validate --archived",
                capture: captureJson({}, null),
            }),
        ).resolves.toMatchObject({
            kind: "terminated",
            message: "OpenSpec validate --archived was terminated before returning a result",
        });
    });

    test.each([
        ["not json", "OpenSpec status returned invalid JSON: not json"],
        ["", "OpenSpec status returned invalid JSON"],
    ])("classifies invalid JSON (%j)", async (stdout, message) => {
        const capture: CaptureStdout = async () => ({ stdout, exitCode: 0 });
        await expect(runOpenSpecJson("status", [], { cwd: "/project", capture })).resolves.toEqual({
            kind: "invalidJson",
            message,
            stdout,
        });
    });

    test("classifies a structured non-zero failure with its message and fix", async () => {
        await expect(
            runOpenSpecJson("status", [], {
                cwd: "/project",
                capture: captureJson(
                    {
                        status: [{ message: "Cannot read status", fix: "Check the change" }],
                    },
                    1,
                ),
            }),
        ).resolves.toEqual({
            kind: "nonZero",
            message: "Cannot read status Fix: Check the change",
            parsed: { status: [{ message: "Cannot read status", fix: "Check the change" }] },
            exitCode: 1,
        });
    });

    test("classifies an unstructured non-zero response as invalid result", async () => {
        await expect(
            runOpenSpecJson("status", [], { cwd: "/project", capture: captureJson([], 1) }),
        ).resolves.toEqual({
            kind: "invalidResult",
            message: invalidResultMessage("status"),
        });
    });

    test("passes through non-zero exits when requested", async () => {
        await expect(
            runOpenSpecJson("validate", [], {
                cwd: "/project",
                nonZero: "passthrough",
                capture: captureJson(["issues"], 1),
            }),
        ).resolves.toEqual({ kind: "success", parsed: ["issues"], exitCode: 1 });
    });

    test("only treats status envelopes as non-zero failures under status-envelope policy", async () => {
        await expect(
            runOpenSpecJson("validate", [], {
                cwd: "/project",
                nonZero: "status-envelope",
                capture: captureJson({ items: [] }, 1),
            }),
        ).resolves.toEqual({ kind: "success", parsed: { items: [] }, exitCode: 1 });
    });

    test("requires a record even when the command exits successfully", async () => {
        await expect(
            runOpenSpecJson("archive", [], {
                cwd: "/project",
                requireRecord: true,
                capture: captureJson("unexpected", 0),
            }),
        ).resolves.toEqual({
            kind: "invalidResult",
            message: "OpenSpec archive returned an invalid result",
        });
    });
});
