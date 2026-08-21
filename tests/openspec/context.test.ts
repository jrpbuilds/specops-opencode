import { describe, expect, test } from "bun:test";
import { getOpenSpecContext } from "../../src/openspec/context.js";

describe("getOpenSpecContext", () => {
    test("uses the canonical list command and reports active changes", async () => {
        let received: { command: string; args: string[]; cwd?: string } | undefined;
        const result = await getOpenSpecContext("/project", async (command, args, cwd) => {
            received = { command, args, cwd };
            return {
                exitCode: 0,
                stdout: JSON.stringify({
                    changes: [
                        {
                            name: "improve-bird-graphics",
                            completedTasks: 2,
                            totalTasks: 5,
                            lastModified: "2026-08-09T10:00:00.000Z",
                            status: "in-progress",
                        },
                    ],
                    root: { path: "/project", source: "nearest" },
                }),
            };
        });

        expect(received).toEqual({
            command: "openspec",
            args: ["list", "--json"],
            cwd: "/project",
        });
        expect(result).toEqual({
            available: true,
            initialized: true,
            activeChanges: [
                {
                    name: "improve-bird-graphics",
                    completedTasks: 2,
                    totalTasks: 5,
                    lastModified: "2026-08-09T10:00:00.000Z",
                    status: "in-progress",
                },
            ],
        });
    });

    test("reports an initialized project with no active changes", async () => {
        const result = await getOpenSpecContext("/project", async () => ({
            exitCode: 0,
            stdout: JSON.stringify({ changes: [], root: { path: "/project", source: "store" } }),
        }));

        expect(result).toEqual({ available: true, initialized: true, activeChanges: [] });
    });

    test("treats the implicit root as uninitialized without assuming nearest is the only valid root", async () => {
        const result = await getOpenSpecContext("/project", async () => ({
            exitCode: 0,
            stdout: JSON.stringify({ changes: [], root: { path: "/project", source: "implicit" } }),
        }));

        expect(result).toEqual({ available: true, initialized: false, activeChanges: [] });
    });

    test("reports an unavailable CLI without an initialization error", async () => {
        const result = await getOpenSpecContext("/project", async () => {
            throw new Error("spawn openspec ENOENT");
        });

        expect(result).toEqual({ available: false, initialized: false, activeChanges: [] });
    });

    test("preserves native command failures as context errors", async () => {
        const result = await getOpenSpecContext("/project", async () => ({
            exitCode: 1,
            stdout: JSON.stringify({
                status: [{ message: "OpenSpec root is invalid", fix: "Run openspec doctor" }],
            }),
        }));

        expect(result.available).toBe(true);
        expect(result.initialized).toBe(false);
        expect(result.error).toBe("OpenSpec root is invalid Fix: Run openspec doctor");
    });

    test("does not turn malformed output into an uninitialized result", async () => {
        const result = await getOpenSpecContext("/project", async () => ({
            exitCode: 0,
            stdout: "not json",
        }));

        expect(result.available).toBe(true);
        expect(result.initialized).toBe(false);
        expect(result.activeChanges).toEqual([]);
        expect(result.error).toContain("invalid JSON");
    });

    test("reports termination before an exit code is available", async () => {
        const result = await getOpenSpecContext("/project", async () => ({
            exitCode: null,
            stdout: "",
        }));

        expect(result.available).toBe(true);
        expect(result.initialized).toBe(false);
        expect(result.error).toBe("OpenSpec list was terminated before returning a result");
    });

    test("reports an invalid result shape", async () => {
        const result = await getOpenSpecContext("/project", async () => ({
            exitCode: 0,
            stdout: JSON.stringify("unexpected"),
        }));

        expect(result.available).toBe(true);
        expect(result.initialized).toBe(false);
        expect(result.error).toContain("OPENSPEC_MALFORMED_RESPONSE");
    });

    test("reports a missing or incomplete root/changes as invalid", async () => {
        const missingRoot = await getOpenSpecContext("/project", async () => ({
            exitCode: 0,
            stdout: JSON.stringify({ changes: [] }),
        }));
        const missingChanges = await getOpenSpecContext("/project", async () => ({
            exitCode: 0,
            stdout: JSON.stringify({ root: { source: "nearest" } }),
        }));

        expect(missingRoot.error).toContain("OPENSPEC_MALFORMED_RESPONSE");
        expect(missingChanges.error).toContain("OPENSPEC_MALFORMED_RESPONSE");
    });

    test("reports a malformed active change entry as invalid", async () => {
        const result = await getOpenSpecContext("/project", async () => ({
            exitCode: 0,
            stdout: JSON.stringify({
                changes: [{ name: "bad" }],
                root: { path: "/project", source: "nearest" },
            }),
        }));

        expect(result.available).toBe(true);
        expect(result.initialized).toBe(false);
        expect(result.error).toContain("OPENSPEC_MALFORMED_RESPONSE");
    });

    test("preserves native command failures with message only", async () => {
        const result = await getOpenSpecContext("/project", async () => ({
            exitCode: 1,
            stdout: JSON.stringify({ status: [{ message: "OpenSpec root is invalid" }] }),
        }));

        expect(result.error).toBe("OpenSpec root is invalid");
    });

    test("falls back to exit code for fix only", async () => {
        const result = await getOpenSpecContext("/project", async () => ({
            exitCode: 1,
            stdout: JSON.stringify({ status: [{ fix: "Run openspec doctor" }] }),
        }));

        expect(result.error).toBe("OpenSpec list failed with exit code 1");
    });

    test("falls back to exit code when status is absent or malformed", async () => {
        const empty = await getOpenSpecContext("/project", async () => ({
            exitCode: 1,
            stdout: JSON.stringify({}),
        }));
        const notArray = await getOpenSpecContext("/project", async () => ({
            exitCode: 1,
            stdout: JSON.stringify({ status: "bad" }),
        }));
        const nonRecordEntry = await getOpenSpecContext("/project", async () => ({
            exitCode: 1,
            stdout: JSON.stringify({ status: ["bad"] }),
        }));

        expect(empty.error).toBe("OpenSpec list failed with exit code 1");
        expect(notArray.error).toBe("OpenSpec list failed with exit code 1");
        expect(nonRecordEntry.error).toBe("OpenSpec list failed with exit code 1");
    });

    test("rejects an unexpected response field", async () => {
        const result = await getOpenSpecContext("/project", async () => ({
            exitCode: 0,
            stdout: JSON.stringify({
                changes: [],
                root: { path: "/project", source: "nearest" },
                extra: true,
            }),
        }));
        expect(result.error).toContain("extra");
        expect(result.error).toContain("not declared");
    });
});
