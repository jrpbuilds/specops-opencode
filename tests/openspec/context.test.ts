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
});
