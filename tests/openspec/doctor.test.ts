import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import * as helpers from "../../src/helpers.js";
import { runOpenSpecDoctor } from "../../src/openspec/doctor.js";

afterEach(() => {
    mock.restore();
});

function capture(stdout: string, exitCode: number | null) {
    return spyOn(helpers, "runCaptureStdout").mockResolvedValue({ stdout, exitCode });
}

describe("runOpenSpecDoctor", () => {
    test("reports a healthy initialized project", async () => {
        capture(
            JSON.stringify({
                root: { path: "/project", source: "nearest", healthy: true },
                status: [],
            }),
            0,
        );

        const result = await runOpenSpecDoctor("/project");
        expect(result).toEqual({ initialized: true, healthy: true, issues: [] });
    });

    test("reports unhealthy when root is healthy but status has errors", async () => {
        capture(
            JSON.stringify({
                root: { path: "/project", source: "nearest", healthy: true },
                status: [
                    { severity: "error", code: "schema", message: "invalid", fix: "update config" },
                ],
            }),
            0,
        );

        const result = await runOpenSpecDoctor("/project");
        expect(result.initialized).toBe(true);
        expect(result.healthy).toBe(false);
        expect(result.issues[0]).toContain("schema: invalid");
        expect(result.issues[0]).toContain("fix: update config");
    });

    test("reports unhealthy when root itself is not healthy", async () => {
        capture(
            JSON.stringify({
                root: { path: "/project", source: "nearest", healthy: false },
                status: [],
            }),
            0,
        );

        const result = await runOpenSpecDoctor("/project");
        expect(result).toEqual({ initialized: true, healthy: false, issues: [] });
    });

    test("reports uninitialized when root object is missing", async () => {
        capture(JSON.stringify({ status: [] }), 0);

        const result = await runOpenSpecDoctor("/project");
        expect(result.initialized).toBe(false);
        expect(result.healthy).toBe(false);
    });

    test("returns an error when openspec cannot be spawned", async () => {
        spyOn(helpers, "runCaptureStdout").mockRejectedValue(new Error("spawn openspec ENOENT"));

        const result = await runOpenSpecDoctor("/project");
        expect(result).toEqual({
            initialized: false,
            healthy: false,
            issues: [],
            error: "spawn openspec ENOENT",
        });
    });

    test("returns an error when the process is terminated", async () => {
        capture("", null);

        const result = await runOpenSpecDoctor("/project");
        expect(result.error).toBe("OpenSpec doctor was terminated before returning a result");
    });

    test("returns an error for invalid JSON", async () => {
        capture("not json", 1);

        const result = await runOpenSpecDoctor("/project");
        expect(result.error).toContain("invalid JSON");
    });

    test("returns an error for an invalid result shape", async () => {
        capture(JSON.stringify("unexpected"), 0);

        const result = await runOpenSpecDoctor("/project");
        expect(result.error).toBe("OpenSpec doctor returned an invalid result");
    });

    test("formats status entries with safe fallbacks", async () => {
        capture(
            JSON.stringify({
                root: { path: "/project", source: "nearest", healthy: true },
                status: [
                    { message: "plain issue" },
                    { code: "E001", fix: "do thing" },
                    { severity: "warning", message: "warn" },
                    {},
                ],
            }),
            0,
        );

        const result = await runOpenSpecDoctor("/project");
        expect(result.issues[0]).toBe("plain issue");
        expect(result.issues[1]).toBe("E001\nfix: do thing");
        expect(result.issues[2]).toBe("warn");
        expect(result.issues[3]).toBe("OpenSpec reported an unspecified issue");
    });
});
