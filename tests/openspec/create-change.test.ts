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
                        },
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
                        change: { id: "new-change", path: "/project/openspec/changes/new-change" },
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
});
