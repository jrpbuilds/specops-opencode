import { describe, expect, test } from "bun:test";
import { createOpenSpecChange } from "../../src/openspec/create-change.js";
import { getOpenSpecContext } from "../../src/openspec/context.js";
import { formatCommandFailure } from "../../src/openspec/helpers.js";
import { doctor } from "../../src/tools/doctor.js";
import { DEFAULT_CONFIG } from "../../src/config.js";

describe("formatCommandFailure characterization (create-change wrapper)", () => {
    test("returns message only", async () => {
        const result = await createOpenSpecChange("test", "/project", undefined, async () => ({
            exitCode: 1,
            stdout: JSON.stringify({ status: [{ message: "Change already exists" }] }),
        }));
        expect(result).toEqual({ ok: false, error: "Change already exists" });
    });

    test("falls back to exit code for fix only", async () => {
        const result = await createOpenSpecChange("test", "/project", undefined, async () => ({
            exitCode: 1,
            stdout: JSON.stringify({ status: [{ fix: "Run openspec doctor" }] }),
        }));
        expect(result).toEqual({
            ok: false,
            error: "OpenSpec create change failed with exit code 1",
        });
    });

    test("returns message and fix joined", async () => {
        const result = await createOpenSpecChange("test", "/project", undefined, async () => ({
            exitCode: 1,
            stdout: JSON.stringify({
                status: [{ message: "OpenSpec root is invalid", fix: "Run openspec doctor" }],
            }),
        }));
        expect(result).toEqual({
            ok: false,
            error: "OpenSpec root is invalid Fix: Run openspec doctor",
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
});

describe("formatCommandFailure characterization (context wrapper)", () => {
    test("returns message only", async () => {
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

    test("returns message and fix joined", async () => {
        const result = await getOpenSpecContext("/project", async () => ({
            exitCode: 1,
            stdout: JSON.stringify({
                status: [{ message: "OpenSpec root is invalid", fix: "Run openspec doctor" }],
            }),
        }));
        expect(result.error).toBe("OpenSpec root is invalid Fix: Run openspec doctor");
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
});

describe("formatArchiveFailure characterization (now canonical formatCommandFailure)", () => {
    test("returns message only", () => {
        const result = formatCommandFailure(
            { status: [{ message: "Archive failed" }] },
            1,
            "archive",
        );
        expect(result).toBe("Archive failed");
    });

    test("falls back to exit code for fix only", () => {
        const result = formatCommandFailure(
            { status: [{ fix: "Run openspec doctor" }] },
            1,
            "archive",
        );
        expect(result).toBe("OpenSpec archive failed with exit code 1");
    });

    test("returns message and fix joined", () => {
        const result = formatCommandFailure(
            { status: [{ message: "Archive failed", fix: "Check permissions" }] },
            1,
            "archive",
        );
        expect(result).toBe("Archive failed Fix: Check permissions");
    });

    test("falls back to exit code when status is absent or malformed", () => {
        expect(formatCommandFailure({}, 1, "archive")).toBe(
            "OpenSpec archive failed with exit code 1",
        );
        expect(formatCommandFailure({ status: "bad" }, 1, "archive")).toBe(
            "OpenSpec archive failed with exit code 1",
        );
        expect(formatCommandFailure({ status: ["bad"] }, 1, "archive")).toBe(
            "OpenSpec archive failed with exit code 1",
        );
    });
});

describe("errorMessage characterization (doctor wrapper)", () => {
    function deps(overrides: { loadConfig: () => Promise<typeof DEFAULT_CONFIG> }) {
        return {
            specopsVersion: async () => "0.1.0",
            openspecVersion: async () => "1.8.0",
            openspecDoctor: async () => ({
                initialized: true,
                healthy: true,
                incompatible: null,
                issues: [],
            }),
            loadConfig: overrides.loadConfig,
        };
    }

    test("extracts Error.message from Error instances", async () => {
        const result = await doctor(
            deps({
                loadConfig: async () => {
                    throw new Error("config is broken");
                },
            }),
        );
        expect(result).toContain("✗ SpecOps configuration invalid: config is broken");
    });

    test("leaves strings intact", async () => {
        const result = await doctor(
            deps({
                loadConfig: async () => {
                    throw "plain string error";
                },
            }),
        );
        expect(result).toContain("✗ SpecOps configuration invalid: plain string error");
    });

    test("stringifies objects", async () => {
        const result = await doctor(
            deps({
                loadConfig: async () => {
                    throw { a: 1 };
                },
            }),
        );
        expect(result).toContain("✗ SpecOps configuration invalid: [object Object]");
    });

    test("stringifies null", async () => {
        const result = await doctor(
            deps({
                loadConfig: async () => {
                    throw null;
                },
            }),
        );
        expect(result).toContain("✗ SpecOps configuration invalid: null");
    });

    test("stringifies undefined", async () => {
        const result = await doctor(
            deps({
                loadConfig: async () => {
                    throw undefined;
                },
            }),
        );
        expect(result).toContain("✗ SpecOps configuration invalid: undefined");
    });
});
