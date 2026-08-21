import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import * as helpers from "../../src/helpers.js";
import { archiveChange } from "../../src/openspec/archive.js";

afterEach(() => {
    mock.restore();
});

describe("archiveChange", () => {
    test("reports a successful archive", async () => {
        spyOn(helpers, "runCaptureStdout").mockResolvedValue({
            exitCode: 0,
            stdout: JSON.stringify({
                archive: {
                    change: "example",
                    archivedAs: "2026-08-09-example",
                    path: "/project/openspec/changes/archive/2026-08-09-example",
                    specsUpdated: false,
                },
                root: { path: "/project", source: "nearest" },
            }),
        });

        const result = await archiveChange("example", "/project");
        expect(result).toEqual({
            ok: true,
            archivedAs: "2026-08-09-example",
            path: "/project/openspec/changes/archive/2026-08-09-example",
        });
    });

    test("reports spawn failure", async () => {
        spyOn(helpers, "runCaptureStdout").mockRejectedValue(new Error("spawn openspec ENOENT"));

        const result = await archiveChange("example", "/project");
        expect(result).toEqual({
            ok: false,
            error: "Unable to run OpenSpec archive: spawn openspec ENOENT",
        });
    });

    test("reports termination before exit", async () => {
        spyOn(helpers, "runCaptureStdout").mockResolvedValue({ exitCode: null, stdout: "" });

        const result = await archiveChange("example", "/project");
        expect(result).toEqual({
            ok: false,
            error: "OpenSpec archive was terminated before returning a result",
        });
    });

    test("reports invalid JSON", async () => {
        spyOn(helpers, "runCaptureStdout").mockResolvedValue({
            exitCode: 1,
            stdout: "not json",
        });

        const result = await archiveChange("example", "/project");
        expect(result).toEqual({
            ok: false,
            error: "OpenSpec archive returned invalid JSON: not json",
        });
    });

    test("reports an invalid result shape", async () => {
        spyOn(helpers, "runCaptureStdout").mockResolvedValue({
            exitCode: 0,
            stdout: JSON.stringify("unexpected"),
        });

        const result = await archiveChange("example", "/project");
        expect(result).toEqual({
            ok: false,
            error: "OpenSpec archive returned an invalid result",
        });
    });

    test("preserves native failure with message only", async () => {
        spyOn(helpers, "runCaptureStdout").mockResolvedValue({
            exitCode: 1,
            stdout: JSON.stringify({ status: [{ message: "Change 'example' not found" }] }),
        });

        const result = await archiveChange("example", "/project");
        expect(result).toEqual({ ok: false, error: "Change 'example' not found" });
    });

    test("falls back to exit code for fix only", async () => {
        spyOn(helpers, "runCaptureStdout").mockResolvedValue({
            exitCode: 1,
            stdout: JSON.stringify({ status: [{ fix: "Check permissions" }] }),
        });

        const result = await archiveChange("example", "/project");
        expect(result).toEqual({
            ok: false,
            error: "OpenSpec archive failed with exit code 1",
        });
    });

    test("preserves native failure with message and fix", async () => {
        spyOn(helpers, "runCaptureStdout").mockResolvedValue({
            exitCode: 1,
            stdout: JSON.stringify({
                status: [{ message: "Archive failed", fix: "Check permissions" }],
            }),
        });

        const result = await archiveChange("example", "/project");
        expect(result).toEqual({ ok: false, error: "Archive failed Fix: Check permissions" });
    });

    test("falls back to exit code when status is absent or malformed", async () => {
        spyOn(helpers, "runCaptureStdout")
            .mockResolvedValueOnce({ exitCode: 1, stdout: JSON.stringify({}) })
            .mockResolvedValueOnce({ exitCode: 1, stdout: JSON.stringify({ status: "bad" }) })
            .mockResolvedValueOnce({ exitCode: 1, stdout: JSON.stringify({ status: ["bad"] }) });

        let result = await archiveChange("example", "/project");
        expect(result).toEqual({ ok: false, error: "OpenSpec archive failed with exit code 1" });
        result = await archiveChange("example", "/project");
        expect(result).toEqual({ ok: false, error: "OpenSpec archive failed with exit code 1" });
        result = await archiveChange("example", "/project");
        expect(result).toEqual({ ok: false, error: "OpenSpec archive failed with exit code 1" });
    });

    test("rejects an unexpected success field", async () => {
        spyOn(helpers, "runCaptureStdout").mockResolvedValue({
            exitCode: 0,
            stdout: JSON.stringify({
                archive: {
                    change: "example",
                    archivedAs: "example",
                    path: "/project/archive",
                    specsUpdated: false,
                },
                root: { path: "/project", source: "nearest" },
                extra: true,
            }),
        });
        const result = await archiveChange("example", "/project");
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toContain("extra");
    });
});
