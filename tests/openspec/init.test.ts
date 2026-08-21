import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import * as helpers from "../../src/helpers.js";
import { initializeOpenSpec, isOpenSpecInitialized } from "../../src/openspec/init.js";
import { withTempDir } from "../helpers.js";

afterEach(() => {
    mock.restore();
});

describe("isOpenSpecInitialized", () => {
    test("returns false when no openspec directory exists", async () => {
        await withTempDir(async dir => {
            expect(await isOpenSpecInitialized(dir)).toBe(false);
        });
    });

    test("returns true when openspec/config.yaml exists in the directory", async () => {
        await withTempDir(async dir => {
            await mkdir(path.join(dir, "openspec"), { recursive: true });
            await writeFile(path.join(dir, "openspec", "config.yaml"), "schema: spec-driven\n");
            expect(await isOpenSpecInitialized(dir)).toBe(true);
        });
    });
});

describe("initializeOpenSpec", () => {
    test("delegates to openspec init and returns success", async () => {
        let received: { command: string; args: string[]; cwd?: string } | undefined;
        spyOn(helpers, "runCaptured").mockImplementation(async (command, args, cwd) => {
            received = { command, args, cwd };
            return { ok: true, stderr: "" };
        });

        const result = await initializeOpenSpec("/project");

        expect(received).toEqual({
            command: "openspec",
            args: ["init", "--tools", "none", "--no-animation"],
            cwd: "/project",
        });
        expect(result).toEqual({ ok: true, stderr: "" });
    });

    test("returns the raw failure result when openspec init fails", async () => {
        spyOn(helpers, "runCaptured").mockResolvedValue({ ok: false, stderr: "permission denied" });

        const result = await initializeOpenSpec("/project");

        expect(result).toEqual({ ok: false, stderr: "permission denied" });
    });

    test("rejects an unexpected init response field", async () => {
        spyOn(helpers, "runCaptured").mockResolvedValue({
            ok: true,
            stderr: "",
            extra: "unexpected",
        } as never);
        await expect(initializeOpenSpec("/project")).rejects.toThrow("extra");
    });
});
