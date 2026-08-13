import { describe, expect, test } from "bun:test";
import { isEngramAvailable } from "../src/engram.js";

type CaptureResult = { stdout: string; exitCode: number | null };
type Capture = (command: string, args: string[], cwd?: string) => Promise<CaptureResult>;

/** Build an injected capture that returns a fixed result. */
function captureWith(result: CaptureResult): Capture {
    return async (_command, _args, _cwd) => result;
}

describe("isEngramAvailable", () => {
    test("probes `engram --version` and returns the trimmed version", async () => {
        let command = "";
        let args: string[] = [];

        const version = await isEngramAvailable(async (spawned, spawnedArgs) => {
            command = spawned;
            args = spawnedArgs;
            return { stdout: " 1.4.0 \n", exitCode: 0 };
        });

        expect(command).toBe("engram");
        expect(args).toEqual(["--version"]);
        expect(version).toBe("1.4.0");
    });

    test("returns null on a non-zero exit", async () => {
        expect(await isEngramAvailable(captureWith({ stdout: "1.4.0", exitCode: 1 }))).toBeNull();
    });

    test("returns null when the process is terminated without an exit code", async () => {
        expect(
            await isEngramAvailable(captureWith({ stdout: "1.4.0", exitCode: null })),
        ).toBeNull();
    });

    test("returns null on blank output", async () => {
        expect(await isEngramAvailable(captureWith({ stdout: "  \n", exitCode: 0 }))).toBeNull();
    });

    test("returns null when the binary cannot be spawned", async () => {
        expect(
            await isEngramAvailable(async () => {
                throw new Error("spawn engram ENOENT");
            }),
        ).toBeNull();
    });
});
