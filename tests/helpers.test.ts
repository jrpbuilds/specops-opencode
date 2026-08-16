import { describe, expect, test } from "bun:test";
import { runCaptured, runCaptureStdout, runExitZero } from "../src/helpers.js";

const bun = process.execPath;

describe("runExitZero", () => {
    test("resolves when the command exits with code 0", async () => {
        await expect(runExitZero(bun, ["-e", "process.exit(0)"])).resolves.toBeUndefined();
    });

    test("rejects when the command exits non-zero", async () => {
        const promise = runExitZero(bun, ["-e", "process.exit(7)"]);
        await expect(promise).rejects.toBeInstanceOf(Error);
        await expect(promise).rejects.toMatchObject({ message: expect.stringContaining("7") });
    });

    test("rejects when the command cannot be spawned", async () => {
        await expect(
            runExitZero("this-command-definitely-does-not-exist", []),
        ).rejects.toBeInstanceOf(Error);
    });
});

describe("runCaptured", () => {
    test("captures stderr and reports success for exit code 0", async () => {
        const result = await runCaptured(bun, [
            "-e",
            "process.stderr.write('hello stderr'); process.exit(0);",
        ]);
        expect(result.ok).toBe(true);
        expect(result.stderr).toBe("hello stderr");
    });

    test("captures stderr and reports failure for a non-zero exit", async () => {
        const result = await runCaptured(bun, [
            "-e",
            "process.stderr.write('something broke'); process.exit(3);",
        ]);
        expect(result.ok).toBe(false);
        expect(result.stderr).toBe("something broke");
    });

    test("rejects when the command cannot be spawned", async () => {
        await expect(
            runCaptured("this-command-definitely-does-not-exist", []),
        ).rejects.toBeInstanceOf(Error);
    });
});

describe("runCaptureStdout", () => {
    test("captures stdout and exit code 0", async () => {
        const result = await runCaptureStdout(bun, [
            "-e",
            "process.stdout.write('hello stdout'); process.exit(0);",
        ]);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toBe("hello stdout");
    });

    test("captures stdout and a non-zero exit code", async () => {
        const result = await runCaptureStdout(bun, [
            "-e",
            "process.stdout.write('partial output'); process.exit(5);",
        ]);
        expect(result.exitCode).toBe(5);
        expect(result.stdout).toBe("partial output");
    });

    test("rejects when the command cannot be spawned", async () => {
        await expect(
            runCaptureStdout("this-command-definitely-does-not-exist", []),
        ).rejects.toBeInstanceOf(Error);
    });
});
