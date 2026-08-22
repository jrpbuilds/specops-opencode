import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import * as helpers from "../../src/helpers.js";
import { getOpenSpecVersion, isOpenSpecAvailable } from "../../src/openspec/cli.js";

afterEach(() => {
    mock.restore();
});

describe("getOpenSpecVersion", () => {
    test("returns the version string when openspec responds successfully", async () => {
        spyOn(helpers, "runCaptureStdout").mockResolvedValue({
            exitCode: 0,
            stdout: "1.10.0",
        });

        expect(await getOpenSpecVersion()).toBe("1.10.0");
    });

    test("returns null when openspec exits non-zero", async () => {
        spyOn(helpers, "runCaptureStdout").mockResolvedValue({
            exitCode: 1,
            stdout: "",
        });

        expect(await getOpenSpecVersion()).toBeNull();
    });

    test("returns null when openspec cannot be spawned", async () => {
        spyOn(helpers, "runCaptureStdout").mockRejectedValue(new Error("spawn openspec ENOENT"));

        expect(await getOpenSpecVersion()).toBeNull();
    });
});

describe("isOpenSpecAvailable", () => {
    test("reflects version availability", async () => {
        spyOn(helpers, "runCaptureStdout").mockResolvedValue({
            exitCode: 0,
            stdout: "1.10.0",
        });

        expect(await isOpenSpecAvailable()).toBe(true);

        spyOn(helpers, "runCaptureStdout").mockRejectedValue(new Error("spawn openspec ENOENT"));

        expect(await isOpenSpecAvailable()).toBe(false);
    });
});
