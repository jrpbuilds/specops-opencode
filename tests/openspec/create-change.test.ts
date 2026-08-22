import { describe, expect, test } from "bun:test";
import { createOpenSpecChange } from "../../src/openspec/create-change.js";

describe("createOpenSpecChange", () => {
    test("uses the canonical creation command and passes the requested name and goal", async () => {
        let received: { command: string; args: string[]; cwd?: string } | undefined;
        const result = await createOpenSpecChange(
            "improve-bird-graphics",
            "/project",
            "Improve the bird graphics",
            async (command, args, cwd) => {
                received = { command, args, cwd };
                return {
                    exitCode: 0,
                    stdout: JSON.stringify({
                        change: {
                            id: "improve-bird-graphics",
                            path: "/project/openspec/changes/improve-bird-graphics",
                            metadataPath:
                                "/project/openspec/changes/improve-bird-graphics/.openspec.yaml",
                            schema: "spec-driven",
                        },
                        root: { path: "/project", source: "nearest" },
                    }),
                };
            },
        );

        expect(received).toEqual({
            command: "openspec",
            args: [
                "new",
                "change",
                "improve-bird-graphics",
                "--goal",
                "Improve the bird graphics",
                "--json",
            ],
            cwd: "/project",
        });
        expect(result).toEqual({
            ok: true,
            name: "improve-bird-graphics",
            path: "/project/openspec/changes/improve-bird-graphics",
        });
    });

    test("omits goal when it is not supplied", async () => {
        let args: string[] | undefined;
        const result = await createOpenSpecChange(
            "new-change",
            "/project",
            undefined,
            async (_command, receivedArgs) => {
                args = receivedArgs;
                return {
                    exitCode: 0,
                    stdout: JSON.stringify({
                        change: {
                            id: "new-change",
                            path: "/project/openspec/changes/new-change",
                            metadataPath: "/project/openspec/changes/new-change/.openspec.yaml",
                            schema: "spec-driven",
                        },
                        root: { path: "/project", source: "nearest" },
                    }),
                };
            },
        );

        expect(args).toEqual(["new", "change", "new-change", "--json"]);
        expect(result).toMatchObject({ ok: true, name: "new-change" });
    });

    test("preserves native creation failures", async () => {
        const result = await createOpenSpecChange(
            "existing-change",
            "/project",
            undefined,
            async () => ({
                exitCode: 1,
                stdout: JSON.stringify({
                    change: null,
                    status: [{ message: "Change 'existing-change' already exists" }],
                }),
            }),
        );

        expect(result).toEqual({
            ok: false,
            error: "Change 'existing-change' already exists",
        });
    });

    test("reports unavailable and malformed command results", async () => {
        const unavailable = await createOpenSpecChange(
            "new-change",
            "/project",
            undefined,
            async () => {
                throw new Error("spawn openspec ENOENT");
            },
        );
        const malformed = await createOpenSpecChange(
            "new-change",
            "/project",
            undefined,
            async () => ({ exitCode: 0, stdout: "not json" }),
        );

        expect(unavailable).toEqual({
            ok: false,
            error: "Unable to run OpenSpec create change: spawn openspec ENOENT",
        });
        expect(malformed).toMatchObject({
            ok: false,
            error: expect.stringContaining("invalid JSON"),
        });
    });

    test("preserves native failure with message only", async () => {
        const result = await createOpenSpecChange(
            "existing-change",
            "/project",
            undefined,
            async () => ({
                exitCode: 1,
                stdout: JSON.stringify({
                    status: [{ message: "Change 'existing-change' exists" }],
                }),
            }),
        );
        expect(result).toEqual({ ok: false, error: "Change 'existing-change' exists" });
    });

    test("falls back to exit code for fix only", async () => {
        const result = await createOpenSpecChange(
            "existing-change",
            "/project",
            undefined,
            async () => ({
                exitCode: 1,
                stdout: JSON.stringify({ status: [{ fix: "Use a different name" }] }),
            }),
        );
        expect(result).toEqual({
            ok: false,
            error: "OpenSpec create change failed with exit code 1",
        });
    });

    test("preserves native failure with message and fix", async () => {
        const result = await createOpenSpecChange(
            "existing-change",
            "/project",
            undefined,
            async () => ({
                exitCode: 1,
                stdout: JSON.stringify({
                    status: [{ message: "Name taken", fix: "Use a different name" }],
                }),
            }),
        );
        expect(result).toEqual({ ok: false, error: "Name taken Fix: Use a different name" });
    });

    test("reports termination before an exit code is available", async () => {
        const result = await createOpenSpecChange(
            "new-change",
            "/project",
            undefined,
            async () => ({
                exitCode: null,
                stdout: "",
            }),
        );
        expect(result).toEqual({
            ok: false,
            error: "OpenSpec create change was terminated before returning a result",
        });
    });

    test("falls back to exit code when status is absent or malformed", async () => {
        const empty = await createOpenSpecChange("test", "/project", undefined, async () => ({
            exitCode: 1,
            stdout: JSON.stringify({}),
        }));
        const notArray = await createOpenSpecChange("test", "/project", undefined, async () => ({
            exitCode: 1,
            stdout: JSON.stringify({ status: "bad" }),
        }));
        const nonRecordEntry = await createOpenSpecChange(
            "test",
            "/project",
            undefined,
            async () => ({
                exitCode: 1,
                stdout: JSON.stringify({ status: ["bad"] }),
            }),
        );

        expect(empty).toEqual({
            ok: false,
            error: "OpenSpec create change failed with exit code 1",
        });
        expect(notArray).toEqual({
            ok: false,
            error: "OpenSpec create change failed with exit code 1",
        });
        expect(nonRecordEntry).toEqual({
            ok: false,
            error: "OpenSpec create change failed with exit code 1",
        });
    });

    test("accepts an unknown success field as forward-compatible", async () => {
        const result = await createOpenSpecChange(
            "new-change",
            "/project",
            undefined,
            async () => ({
                exitCode: 0,
                stdout: JSON.stringify({
                    change: {
                        id: "new-change",
                        path: "/project/change",
                        metadataPath: "/project/change/.openspec.yaml",
                        schema: "spec-driven",
                    },
                    root: { path: "/project", source: "nearest" },
                    extra: true,
                }),
            }),
        );
        expect(result).toEqual({
            ok: true,
            name: "new-change",
            path: "/project/change",
        });
    });
});
