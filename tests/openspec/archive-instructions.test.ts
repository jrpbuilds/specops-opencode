import { describe, expect, test } from "bun:test";
import { getArchiveInstructions } from "../../src/openspec/archive-instructions.js";
import type { CaptureStdout } from "../../src/openspec/helpers.js";

const completeContext = {
    changeName: "example-change",
    context: "Archive only after the lifecycle gate.",
    operationGuidance: ["Preserve the archive confirmation boundary."],
    root: { path: "/project", source: "nearest" },
};

function captureJson(value: unknown, exitCode = 0): CaptureStdout {
    return async () => ({ stdout: JSON.stringify(value), exitCode });
}

describe("getArchiveInstructions", () => {
    test("invokes OpenSpec and normalizes archive guidance while ignoring root", async () => {
        let invocation: { command: string; args: string[]; cwd?: string } | undefined;
        const capture: CaptureStdout = async (command, args, cwd) => {
            invocation = { command, args, cwd };
            return { stdout: JSON.stringify(completeContext), exitCode: 0 };
        };

        const result = await getArchiveInstructions("example-change", "/project", capture);

        expect(invocation).toEqual({
            command: "openspec",
            args: ["instructions", "archive", "--change", "example-change", "--json"],
            cwd: "/project",
        });
        expect(result).toEqual({
            ok: true,
            context: {
                changeName: completeContext.changeName,
                context: completeContext.context,
                operationGuidance: completeContext.operationGuidance,
            },
        });
        if (result.ok) expect(result.context).not.toHaveProperty("root");
    });

    test("normalizes the required change name when optional fields are absent", async () => {
        const result = await getArchiveInstructions(
            "example-change",
            "/project",
            captureJson({ changeName: "example-change", root: completeContext.root }),
        );

        expect(result).toEqual({ ok: true, context: { changeName: "example-change" } });
    });

    test("reports a capture failure", async () => {
        const result = await getArchiveInstructions("example-change", "/project", async () => {
            throw new Error("spawn openspec ENOENT");
        });

        expect(result).toEqual({
            ok: false,
            error: "Unable to run OpenSpec instructions archive: spawn openspec ENOENT",
        });
    });

    test("reports a terminated process", async () => {
        const result = await getArchiveInstructions("example-change", "/project", async () => ({
            stdout: "",
            exitCode: null,
        }));

        expect(result).toEqual({
            ok: false,
            error: "OpenSpec instructions archive was terminated before returning a result",
        });
    });

    test("reports invalid JSON including stdout", async () => {
        const result = await getArchiveInstructions("example-change", "/project", async () => ({
            stdout: "not json",
            exitCode: 0,
        }));

        expect(result).toEqual({
            ok: false,
            error: "OpenSpec instructions archive returned invalid JSON: not json",
        });
    });

    test("reports non-zero record and non-record responses", async () => {
        const recordFailure = await getArchiveInstructions(
            "example-change",
            "/project",
            captureJson({ status: [{ message: "Cannot archive" }] }, 1),
        );
        const nonRecordFailure = await getArchiveInstructions(
            "example-change",
            "/project",
            captureJson([], 1),
        );

        expect(recordFailure).toEqual({ ok: false, error: "Cannot archive" });
        expect(nonRecordFailure).toEqual({
            ok: false,
            error: "OpenSpec instructions archive returned an invalid result",
        });
    });

    test("reports a missing required change name", async () => {
        const result = await getArchiveInstructions(
            "example-change",
            "/project",
            captureJson({ root: completeContext.root }),
        );

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toContain("OPENSPEC_MALFORMED_RESPONSE");
    });
});
