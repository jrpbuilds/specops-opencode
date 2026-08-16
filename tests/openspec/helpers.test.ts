import { describe, expect, test } from "bun:test";
import { errorMessage, formatCommandFailure, isRecord } from "../../src/openspec/helpers.js";

describe("isRecord", () => {
    test("accepts plain objects", () => {
        expect(isRecord({ a: 1 })).toBe(true);
    });

    test("rejects arrays", () => {
        expect(isRecord([])).toBe(false);
    });

    test("rejects null", () => {
        expect(isRecord(null)).toBe(false);
    });

    test("rejects primitives", () => {
        expect(isRecord("string")).toBe(false);
        expect(isRecord(42)).toBe(false);
        expect(isRecord(true)).toBe(false);
        expect(isRecord(undefined)).toBe(false);
    });
});

describe("errorMessage", () => {
    test("returns the message of an Error", () => {
        expect(errorMessage(new Error("boom"))).toBe("boom");
    });

    test("leaves strings intact", () => {
        expect(errorMessage("plain error")).toBe("plain error");
    });

    test("stringifies objects", () => {
        expect(errorMessage({ a: 1 })).toBe("[object Object]");
    });

    test("stringifies null and undefined", () => {
        expect(errorMessage(null)).toBe("null");
        expect(errorMessage(undefined)).toBe("undefined");
    });
});

describe("formatCommandFailure", () => {
    test("returns message only", () => {
        expect(formatCommandFailure({ status: [{ message: "Failed" }] }, 1, "cmd")).toBe("Failed");
    });

    test("falls back to exit code for fix only", () => {
        expect(formatCommandFailure({ status: [{ fix: "Do this" }] }, 2, "cmd")).toBe(
            "OpenSpec cmd failed with exit code 2",
        );
    });

    test("returns message and fix joined", () => {
        expect(
            formatCommandFailure({ status: [{ message: "Failed", fix: "Do this" }] }, 1, "cmd"),
        ).toBe("Failed Fix: Do this");
    });

    test("falls back to exit code when status is absent or malformed", () => {
        expect(formatCommandFailure({}, 3, "cmd")).toBe("OpenSpec cmd failed with exit code 3");
        expect(formatCommandFailure({ status: "bad" }, 3, "cmd")).toBe(
            "OpenSpec cmd failed with exit code 3",
        );
        expect(formatCommandFailure({ status: ["bad"] }, 3, "cmd")).toBe(
            "OpenSpec cmd failed with exit code 3",
        );
    });
});
