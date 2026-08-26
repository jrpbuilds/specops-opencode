import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import * as helpers from "../../src/helpers.js";
import { runOpenSpecDoctor } from "../../src/openspec/doctor.js";
import type { CompatibilityReport } from "../../src/openspec/compatibility.js";

afterEach(() => {
    mock.restore();
});

function capture(
    stdout: string,
    exitCode: number | null,
    archived?: { stdout: string; exitCode: number | null },
) {
    return spyOn(helpers, "runCaptureStdout").mockImplementation(async (_command, args) =>
        args[0] === "validate" && args[1] === "--archived"
            ? (archived ?? { stdout: JSON.stringify(archivedResponse()), exitCode: 0 })
            : { stdout, exitCode },
    );
}

function archivedResponse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        items: [
            {
                id: "archived-change",
                type: "change",
                valid: true,
                issues: [],
                durationMs: 5,
            },
        ],
        summary: { totals: { items: 1, passed: 1, failed: 0 }, byType: {} },
        version: "1.0",
        root: { path: "/project", source: "nearest" },
        ...overrides,
    };
}

const compatibleProbe = async (
    _cwd: string,
    _capture: Parameters<typeof runOpenSpecDoctor>[1],
    readVersion: () => Promise<string | null>,
): Promise<CompatibilityReport> => ({
    compatible: true,
    missingCapabilities: [],
    unsupportedCapabilities: [],
    installedVersion: await readVersion(),
    targetVersion: "1.10.0",
    warnings: [],
});

function runDoctor() {
    return runOpenSpecDoctor("/project", undefined, async () => "1.10.0", compatibleProbe);
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
                unsupportedCapabilities: [],
                installedVersion: "1.7.0",
                targetVersion: "1.10.0",
                warnings: [],
            }),
        );

        expect(result.healthy).toBe(false);
        expect(result.incompatible).toMatchObject({
            installedVersion: "1.7.0",
            targetVersion: "1.10.0",
        });
        const remediation = result.incompatible?.remediation ?? "";
        expect(remediation.split("\n", 1)[0]).toContain("validate-strict-scoped");
        expect(remediation).toContain("bun install -g @fission-ai/openspec@latest");
        expect(remediation).toContain("exposes the failing capability");
        expect(result.archived).toBeUndefined();
        expect(calls).toEqual([]);
    });

    test("surfaces a version shortfall warning without incompatible-install", async () => {
        const warning =
            "OpenSpec 1.7.9 is below SpecOps target 1.10.0 — capability instructions-resolved-output-path not directly verifiable";
        const checkCompatibility = async (
            _cwd: string,
            _capture: Parameters<typeof runOpenSpecDoctor>[1],
            readVersion: () => Promise<string | null>,
        ): Promise<CompatibilityReport> => ({
            compatible: true,
            missingCapabilities: [],
            unsupportedCapabilities: [],
            installedVersion: await readVersion(),
            targetVersion: "1.10.0",
            warnings: [warning],
        });
        const response = JSON.stringify(doctorResponse());
        const runWithResponse = (stdout: string) =>
            runOpenSpecDoctor(
                "/project",
                async () => ({ stdout, exitCode: 0 }),
                async () => "1.7.9",
                checkCompatibility,
            );

        const initialized = await runWithResponse(response);
        expect(initialized.incompatible).toBeNull();
        expect(initialized.issues).toContain(`warning: ${warning}`);

        const { root: _root, ...withoutRoot } = doctorResponse();
        const uninitialized = await runWithResponse(JSON.stringify(withoutRoot));
        expect(uninitialized.initialized).toBe(false);
        expect(uninitialized.incompatible).toBeNull();
        expect(uninitialized.issues).toContain(`warning: ${warning}`);
    });

    test("reports a healthy initialized project", async () => {
        capture(JSON.stringify(doctorResponse()), 0);

        const result = await runDoctor();
        expect(result).toEqual({
            initialized: true,
            healthy: true,
            incompatible: null,
            issues: [],
            archived: { state: "supported-healthy" },
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
            archived: { state: "supported-healthy" },
        });
    });

    test("reports uninitialized when root object is missing", async () => {
        const { root: _root, ...withoutRoot } = doctorResponse();
        capture(JSON.stringify(withoutRoot), 0);

        const result = await runDoctor();
        expect(result.initialized).toBe(false);
        expect(result.healthy).toBe(false);
        expect(result.archived).toBeUndefined();
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

    test("accepts status entries with unexpected fields", async () => {
        capture(
            JSON.stringify(
                doctorResponse({
                    status: [{ severity: "error", code: "E001", message: "invalid", extra: true }],
                }),
            ),
            0,
        );

        const result = await runDoctor();
        expect(result.error).toBeUndefined();
        expect(result.issues).toEqual(["E001: invalid"]);
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

    test("reports invalid archived changes without affecting base health", async () => {
        capture(JSON.stringify(doctorResponse()), 0, {
            stdout: JSON.stringify(
                archivedResponse({
                    items: [
                        {
                            id: "archived-change",
                            type: "change",
                            valid: false,
                            issues: [
                                {
                                    level: "error",
                                    path: "proposal.md",
                                    message: "missing why",
                                },
                            ],
                            durationMs: 5,
                        },
                    ],
                }),
            ),
            exitCode: 0,
        });

        const result = await runDoctor();
        expect(result.initialized).toBe(true);
        expect(result.healthy).toBe(true);
        expect(result.archived).toEqual({
            state: "supported-invalid",
            issues: [
                {
                    itemId: "archived-change",
                    level: "error",
                    path: "proposal.md",
                    message: "missing why",
                },
            ],
        });
    });

    test("reports an empty archived surface (no items field) as supported-healthy", async () => {
        capture(JSON.stringify(doctorResponse()), 0, {
            stdout: JSON.stringify({
                summary: { totals: { items: 0, passed: 0, failed: 0 }, byType: {} },
                version: "1.0",
                root: { path: "/project", source: "nearest" },
            }),
            exitCode: 0,
        });

        const result = await runDoctor();
        expect(result.archived).toEqual({ state: "supported-healthy" });
        expect(result.healthy).toBe(true);
    });

    test("reports an errored archived check on malformed archived JSON", async () => {
        capture(JSON.stringify(doctorResponse()), 0, { stdout: "not json", exitCode: 0 });

        const result = await runDoctor();
        expect(result.archived?.state).toBe("errored");
        expect(result.archived?.error).toContain("OPENSPEC_MALFORMED_RESPONSE");
        expect(result.healthy).toBe(true);
    });

    test("reports an errored archived check when the archived command is terminated", async () => {
        capture(JSON.stringify(doctorResponse()), 0, { stdout: "", exitCode: null });

        const result = await runDoctor();
        expect(result.archived).toEqual({
            state: "errored",
            error: "OpenSpec validate --archived was terminated before returning a result",
        });
        expect(result.healthy).toBe(true);
    });

    test("reports the archived check as unsupported without invoking validate --archived", async () => {
        const calls: string[][] = [];
        const result = await runOpenSpecDoctor(
            "/project",
            async (command, args) => {
                calls.push([command, ...args]);
                return { stdout: JSON.stringify(doctorResponse()), exitCode: 0 };
            },
            async () => "1.10.0",
            async () => ({
                compatible: true,
                missingCapabilities: [],
                unsupportedCapabilities: [
                    {
                        id: "validate-archived",
                        description: "openspec validate --archived JSON output",
                    },
                ],
                installedVersion: "1.10.0",
                targetVersion: "1.10.0",
                warnings: [],
            }),
        );

        expect(result.archived).toEqual({ state: "unsupported" });
        expect(calls).toEqual([["openspec", "doctor", "--json"]]);
    });
});
