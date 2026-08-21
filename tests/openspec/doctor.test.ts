import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import * as helpers from "../../src/helpers.js";
import { runOpenSpecDoctor } from "../../src/openspec/doctor.js";
import type { CompatibilityReport } from "../../src/openspec/compatibility.js";

afterEach(() => {
    mock.restore();
});

function capture(stdout: string, exitCode: number | null) {
    return spyOn(helpers, "runCaptureStdout").mockResolvedValue({ stdout, exitCode });
}

const compatibleProbe = async (
    _cwd: string,
    _capture: Parameters<typeof runOpenSpecDoctor>[1],
    readVersion: () => Promise<string | null>,
): Promise<CompatibilityReport> => ({
    compatible: true,
    missingCapabilities: [],
    installedVersion: await readVersion(),
    minimumVersion: "1.8.0",
});

function runDoctor() {
    return runOpenSpecDoctor("/project", undefined, async () => "1.8.0", compatibleProbe);
}

function doctorResponse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        root: { path: "/project", source: "nearest", healthy: true, status: [] },
        store: null,
        references: [],
        status: [],
        ...overrides,
    };
}

describe("runOpenSpecDoctor", () => {
    test("short-circuits doctor JSON for a present but incompatible install", async () => {
        const calls: string[][] = [];
        const result = await runOpenSpecDoctor(
            "/project",
            async (command, args) => {
                calls.push([command, ...args]);
                return { stdout: "should not run", exitCode: 0 };
            },
            async () => "1.7.0",
            async () => ({
                compatible: false,
                missingCapabilities: [
                    { id: "validate-strict-scoped", description: "strict scoped validation" },
                ],
                installedVersion: "1.7.0",
                minimumVersion: "1.8.0",
            }),
        );

        expect(result.healthy).toBe(false);
        expect(result.incompatible).toMatchObject({
            installedVersion: "1.7.0",
            minimumVersion: "1.8.0",
        });
        expect(result.incompatible?.remediation).toContain("validate-strict-scoped");
        expect(calls).toEqual([]);
    });

    test("reports a healthy initialized project", async () => {
        capture(JSON.stringify(doctorResponse()), 0);

        const result = await runDoctor();
        expect(result).toEqual({
            initialized: true,
            healthy: true,
            incompatible: null,
            issues: [],
        });
    });

    test("reports unhealthy when root is healthy but status has errors", async () => {
        capture(
            JSON.stringify(
                doctorResponse({
                    status: [
                        {
                            severity: "error",
                            code: "schema",
                            message: "invalid",
                            fix: "update config",
                        },
                    ],
                }),
            ),
            0,
        );

        const result = await runDoctor();
        expect(result.initialized).toBe(true);
        expect(result.healthy).toBe(false);
        expect(result.issues[0]).toContain("schema: invalid");
        expect(result.issues[0]).toContain("fix: update config");
    });

    test("reports unhealthy when root itself is not healthy", async () => {
        capture(
            JSON.stringify(
                doctorResponse({
                    root: { path: "/project", source: "nearest", healthy: false },
                }),
            ),
            0,
        );

        const result = await runDoctor();
        expect(result).toEqual({
            initialized: true,
            healthy: false,
            incompatible: null,
            issues: [],
        });
    });

    test("reports uninitialized when root object is missing", async () => {
        const { root: _root, ...withoutRoot } = doctorResponse();
        capture(JSON.stringify(withoutRoot), 0);

        const result = await runDoctor();
        expect(result.initialized).toBe(false);
        expect(result.healthy).toBe(false);
    });

    test("returns an error when openspec cannot be spawned", async () => {
        spyOn(helpers, "runCaptureStdout").mockRejectedValue(new Error("spawn openspec ENOENT"));

        const result = await runOpenSpecDoctor(
            "/project",
            undefined,
            async () => {
                throw new Error("spawn openspec ENOENT");
            },
            compatibleProbe,
        );
        expect(result).toEqual({
            initialized: false,
            healthy: false,
            incompatible: null,
            issues: [],
            error: "spawn openspec ENOENT",
            remediation:
                "OPENSPEC_UNAVAILABLE: OpenSpec is unavailable\nFix:\n  1. Install OpenSpec: npm install -g @fission-ai/openspec\n  2. Re-run specops_doctor.",
        });
    });

    test("returns an error when the process is terminated", async () => {
        capture("", null);

        const result = await runDoctor();
        expect(result.error).toBe("OpenSpec doctor was terminated before returning a result");
    });

    test("returns an error for invalid JSON", async () => {
        capture("not json", 1);

        const result = await runDoctor();
        expect(result.error).toContain("invalid JSON");
    });

    test("returns an error for an invalid result shape", async () => {
        capture(JSON.stringify("unexpected"), 0);

        const result = await runDoctor();
        expect(result.error).toContain('openspec doctor: field "response" expected record');
        expect(result.error).toContain("OPENSPEC_MALFORMED_RESPONSE");
    });

    test("rejects status entries with unexpected fields", async () => {
        capture(
            JSON.stringify(
                doctorResponse({
                    status: [{ severity: "error", code: "E001", message: "invalid", extra: true }],
                }),
            ),
            0,
        );

        const result = await runDoctor();
        expect(result.error).toContain('field "extra"');
        expect(result.error).toContain("OPENSPEC_MALFORMED_RESPONSE");
    });

    test("rejects status entries missing consumed fields", async () => {
        capture(
            JSON.stringify(
                doctorResponse({
                    status: [{ severity: "error", message: "invalid" }],
                }),
            ),
            0,
        );

        const result = await runDoctor();
        expect(result.error).toContain('field "code"');
        expect(result.error).toContain("OPENSPEC_MALFORMED_RESPONSE");
    });

    test("accepts status entries without an optional fix", async () => {
        capture(
            JSON.stringify(
                doctorResponse({
                    status: [{ severity: "warning", code: "E001", message: "warn" }],
                }),
            ),
            0,
        );

        const result = await runDoctor();
        expect(result.healthy).toBe(true);
        expect(result.issues).toEqual(["E001: warn"]);
    });
});
