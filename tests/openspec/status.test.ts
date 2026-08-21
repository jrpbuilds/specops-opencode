import { describe, expect, test } from "bun:test";
import { getOpenSpecStatus } from "../../src/openspec/status.js";
import type { CaptureStdout } from "../../src/openspec/helpers.js";

function captureJson(value: unknown, exitCode = 0): CaptureStdout {
    return async () => ({ stdout: JSON.stringify(value), exitCode });
}

const completeStatus = {
    changeName: "harden-openspec-validation-compatibility",
    schemaName: "spec-driven",
    planningHome: {
        kind: "repo",
        root: "/project",
        changesDir: "/project/openspec/changes",
        defaultSchema: "spec-driven",
    },
    changeRoot: "/project/openspec/changes/harden-openspec-validation-compatibility",
    artifactPaths: {
        proposal: {
            outputPath: "proposal.md",
            resolvedOutputPath:
                "/project/openspec/changes/harden-openspec-validation-compatibility/proposal.md",
            existingOutputPaths: [
                "/project/openspec/changes/harden-openspec-validation-compatibility/proposal.md",
            ],
        },
        design: {
            outputPath: "design.md",
            resolvedOutputPath:
                "/project/openspec/changes/harden-openspec-validation-compatibility/design.md",
            existingOutputPaths: [
                "/project/openspec/changes/harden-openspec-validation-compatibility/design.md",
            ],
        },
    },
    isPlanningComplete: true,
    isComplete: true,
    nextSteps: ["All planning artifacts are complete."],
    actionContext: {
        mode: "repo-local",
        sourceOfTruth: "repo",
        planningArtifacts: ["proposal", "specs", "design", "tasks"],
        linkedContext: [],
        allowedEditRoots: ["/project"],
        requiresAffectedAreaSelection: false,
        constraints: ["Repo-local change artifacts are scoped to this project."],
    },
    root: { path: "/project", source: "nearest" },
} as const;

const legacyArtifacts = [
    {
        id: "proposal",
        outputPath: "openspec/changes/harden-openspec-validation-compatibility/proposal.md",
        status: "done",
        requires: [],
        missingDeps: [],
    },
    {
        id: "design",
        outputPath: "openspec/changes/harden-openspec-validation-compatibility/design.md",
        status: "ready",
        requires: ["proposal"],
        missingDeps: [],
    },
] as const;

const normalizedStatus = {
    changeName: completeStatus.changeName,
    schemaName: completeStatus.schemaName,
    isPlanningComplete: true,
    applyRequires: [],
    artifacts: [
        {
            id: "proposal",
            outputPath: completeStatus.artifactPaths.proposal.resolvedOutputPath,
            status: "done",
            requires: [],
        },
        {
            id: "design",
            outputPath: completeStatus.artifactPaths.design.resolvedOutputPath,
            status: "done",
            requires: [],
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
        expect(result).toEqual({ ok: true, status: normalizedStatus });
    });

    test("preserves skipped artifacts", async () => {
        const result = await getOpenSpecStatus(
            "example",
            "/project",
            captureJson({
                ...completeStatus,
                artifacts: [{ ...legacyArtifacts[0], status: "skipped" }],
            }),
        );

        expect(result).toEqual({
            ok: true,
            status: {
                ...normalizedStatus,
                artifacts: [{ ...legacyArtifacts[0], status: "skipped" }],
            },
        });
    });

    test("preserves blocked artifacts and their missing dependencies", async () => {
        const blocked = {
            ...legacyArtifacts[1],
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
            status: { ...normalizedStatus, artifacts: [blocked] },
        });
    });

    test("omits isPlanningComplete when the schema does not provide it", async () => {
        const { isPlanningComplete: _planningComplete, ...withoutPlanning } = completeStatus;
        const result = await getOpenSpecStatus("example", "/project", captureJson(withoutPlanning));

        expect(result.ok).toBe(false);
    });

    test("omits missingDeps when an artifact does not provide it", async () => {
        const { missingDeps: _missingDeps, ...withoutMissingDeps } = legacyArtifacts[0];
        const response = { ...completeStatus, artifacts: [withoutMissingDeps] };
        const result = await getOpenSpecStatus("example", "/project", captureJson(response));

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect("missingDeps" in result.status.artifacts[0]).toBe(false);
            expect(result.status).toEqual({ ...normalizedStatus, artifacts: [withoutMissingDeps] });
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

            expect(result.ok).toBe(false);
            if (!result.ok) expect(result.error).toContain("OPENSPEC_MALFORMED_RESPONSE");
        },
    );

    test("reports an unknown artifact status as a shape failure", async () => {
        const result = await getOpenSpecStatus(
            "example",
            "/project",
            captureJson({
                ...completeStatus,
                artifacts: [{ ...legacyArtifacts[0], status: "pending" }],
            }),
        );

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toContain("OPENSPEC_MALFORMED_RESPONSE");
    });

    test("reports a missing required top-level field as a shape failure", async () => {
        const { nextSteps: _nextSteps, ...withoutNextSteps } = completeStatus;
        const result = await getOpenSpecStatus(
            "example",
            "/project",
            captureJson(withoutNextSteps),
        );

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toContain("OPENSPEC_MALFORMED_RESPONSE");
    });

    test("rejects an unexpected response field", async () => {
        const result = await getOpenSpecStatus(
            "example",
            "/project",
            captureJson({ ...completeStatus, newerField: true }),
        );
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error).toContain("newerField");
            expect(result.error).toContain("not declared");
        }
    });
});
