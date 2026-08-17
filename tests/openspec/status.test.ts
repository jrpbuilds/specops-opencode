import { describe, expect, test } from "bun:test";
import { getOpenSpecStatus, type NormalizedStatus } from "../../src/openspec/status.js";
import type { CaptureStdout } from "../../src/openspec/helpers.js";

function captureJson(value: unknown, exitCode = 0): CaptureStdout {
    return async () => ({ stdout: JSON.stringify(value), exitCode });
}

const completeStatus = {
    changeName: "example",
    schemaName: "spec-driven",
    isPlanningComplete: true,
    applyRequires: ["proposal", "design"],
    artifacts: [
        {
            id: "proposal",
            outputPath: "openspec/changes/example/proposal.md",
            status: "done",
            requires: [],
            missingDeps: [],
        },
        {
            id: "design",
            outputPath: "openspec/changes/example/design.md",
            status: "ready",
            requires: ["proposal"],
            missingDeps: [],
        },
    ],
} as const;

describe("getOpenSpecStatus", () => {
    test("normalizes a successful response with every field", async () => {
        let invocation: { command: string; args: string[]; cwd?: string } | undefined;
        const capture: CaptureStdout = async (command, args, cwd) => {
            invocation = { command, args, cwd };
            return { stdout: JSON.stringify(completeStatus), exitCode: 0 };
        };

        const result = await getOpenSpecStatus("example", "/project", capture);

        expect(invocation).toEqual({
            command: "openspec",
            args: ["status", "--change", "example", "--json"],
            cwd: "/project",
        });
        expect(result).toEqual({ ok: true, status: completeStatus });
    });

    test("preserves skipped artifacts", async () => {
        const result = await getOpenSpecStatus(
            "example",
            "/project",
            captureJson({
                ...completeStatus,
                artifacts: [{ ...completeStatus.artifacts[0], status: "skipped" }],
            }),
        );

        expect(result).toEqual({
            ok: true,
            status: {
                ...completeStatus,
                artifacts: [{ ...completeStatus.artifacts[0], status: "skipped" }],
            },
        });
    });

    test("preserves blocked artifacts and their missing dependencies", async () => {
        const blocked = {
            ...completeStatus.artifacts[1],
            status: "blocked" as const,
            missingDeps: ["specification"],
        };
        const result = await getOpenSpecStatus(
            "example",
            "/project",
            captureJson({ ...completeStatus, artifacts: [blocked] }),
        );

        expect(result).toEqual({
            ok: true,
            status: { ...completeStatus, artifacts: [blocked] },
        });
    });

    test("omits isPlanningComplete when the schema does not provide it", async () => {
        const { isPlanningComplete: _planningComplete, ...withoutPlanning } = completeStatus;
        const result = await getOpenSpecStatus("example", "/project", captureJson(withoutPlanning));

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect("isPlanningComplete" in result.status).toBe(false);
            expect(result.status).toEqual(withoutPlanning satisfies NormalizedStatus);
        }
    });

    test("omits missingDeps when an artifact does not provide it", async () => {
        const { missingDeps: _missingDeps, ...withoutMissingDeps } = completeStatus.artifacts[0];
        const response = { ...completeStatus, artifacts: [withoutMissingDeps] };
        const result = await getOpenSpecStatus("example", "/project", captureJson(response));

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect("missingDeps" in result.status.artifacts[0]).toBe(false);
            expect(result.status).toEqual(response);
        }
    });

    test("reports malformed JSON", async () => {
        const result = await getOpenSpecStatus("example", "/project", async () => ({
            stdout: "not json",
            exitCode: 0,
        }));

        expect(result).toEqual({
            ok: false,
            error: "OpenSpec status returned invalid JSON: not json",
        });
    });

    test("reports a capture failure", async () => {
        const result = await getOpenSpecStatus("example", "/project", async () => {
            throw new Error("spawn openspec ENOENT");
        });

        expect(result).toEqual({
            ok: false,
            error: "Unable to run OpenSpec status: spawn openspec ENOENT",
        });
    });

    test("reports a terminated process", async () => {
        const result = await getOpenSpecStatus("example", "/project", async () => ({
            stdout: "result unavailable",
            exitCode: null,
        }));

        expect(result).toEqual({
            ok: false,
            error: "OpenSpec status was terminated before returning a result",
        });
    });

    test("surfaces the first status message and fix on command failure", async () => {
        const result = await getOpenSpecStatus(
            "example",
            "/project",
            captureJson(
                {
                    status: [
                        { message: "Change could not be read", fix: "Check the change name" },
                        { message: "Do not use this message" },
                    ],
                },
                1,
            ),
        );

        expect(result).toEqual({
            ok: false,
            error: "Change could not be read Fix: Check the change name",
        });
    });

    test.each(["[]", JSON.stringify("unexpected"), "null"])(
        "reports an invalid top-level result for %s",
        async stdout => {
            const result = await getOpenSpecStatus("example", "/project", async () => ({
                stdout,
                exitCode: 0,
            }));

            expect(result).toEqual({
                ok: false,
                error: "OpenSpec status returned an invalid result",
            });
        },
    );

    test("reports an unknown artifact status as a shape failure", async () => {
        const result = await getOpenSpecStatus(
            "example",
            "/project",
            captureJson({
                ...completeStatus,
                artifacts: [{ ...completeStatus.artifacts[0], status: "pending" }],
            }),
        );

        expect(result).toEqual({
            ok: false,
            error: "OpenSpec status failed with exit code 0",
        });
    });

    test("reports a missing required top-level field as a shape failure", async () => {
        const { applyRequires: _applyRequires, ...withoutApplyRequires } = completeStatus;
        const result = await getOpenSpecStatus(
            "example",
            "/project",
            captureJson(withoutApplyRequires),
        );

        expect(result).toEqual({
            ok: false,
            error: "OpenSpec status failed with exit code 0",
        });
    });
});
