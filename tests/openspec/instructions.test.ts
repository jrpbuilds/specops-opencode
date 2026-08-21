import { describe, expect, test } from "bun:test";
import path from "node:path";
import { getOpenSpecInstructions } from "../../src/openspec/instructions.js";
import type { CaptureStdout } from "../../src/openspec/helpers.js";
import { withTempDir } from "../helpers.js";

function captureJson(value: unknown, exitCode = 0): CaptureStdout {
    return async () => ({ stdout: JSON.stringify(value), exitCode });
}

const completeInstructions = {
    changeName: "harden-openspec-validation-compatibility",
    artifactId: "proposal",
    schemaName: "spec-driven",
    changeDir: path.join(
        process.cwd(),
        "openspec/changes/harden-openspec-validation-compatibility",
    ),
    planningHome: {
        kind: "repo",
        root: process.cwd(),
        changesDir: path.join(process.cwd(), "openspec/changes"),
        defaultSchema: "spec-driven",
    },
    outputPath: "proposal.md",
    resolvedOutputPath: path.join("/tmp", "specops-proposal.md"),
    existingOutputPaths: [path.join("/tmp", "specops-proposal.md")],
    description: "Initial proposal document outlining the change",
    instruction: "Create the proposal document that establishes WHY this change is needed.",
    unlocks: ["specs", "design"],
    root: { path: process.cwd(), source: "nearest" },
} as const;

describe("getOpenSpecInstructions", () => {
    test("invokes OpenSpec with the artifact id, change, and cwd", async () => {
        let invocation: { command: string; args: string[]; cwd?: string } | undefined;
        const capture: CaptureStdout = async (command, args, cwd) => {
            invocation = { command, args, cwd };
            return { stdout: JSON.stringify(completeInstructions), exitCode: 0 };
        };

        const result = await getOpenSpecInstructions("proposal", "example", "/project", capture);

        expect(invocation).toEqual({
            command: "openspec",
            args: ["instructions", "proposal", "--change", "example", "--json"],
            cwd: "/project",
        });
        expect(result).toEqual({
            ok: true,
            instructions: {
                id: "proposal",
                resolvedOutputPath: completeInstructions.resolvedOutputPath,
                template: completeInstructions.description,
                instruction: completeInstructions.instruction,
                dependencies: [],
            },
        });
    });

    test("normalizes optional fields when OpenSpec provides them", async () => {
        const response = {
            ...completeInstructions,
            template: "# Proposal",
            dependencies: [
                {
                    id: "research",
                    done: true,
                    path: "research.md",
                    description: "Repository research",
                },
            ],
            context: "Use repository evidence.",
            rules: "Preserve completed artifacts.",
            skipped: true,
            warning: "This artifact is optional.",
        };

        const result = await getOpenSpecInstructions(
            "proposal",
            "example",
            "/project",
            captureJson(response),
        );

        expect(result).toEqual({
            ok: true,
            instructions: {
                id: "proposal",
                resolvedOutputPath: completeInstructions.resolvedOutputPath,
                template: "# Proposal",
                instruction: completeInstructions.instruction,
                dependencies: response.dependencies,
                context: response.context,
                rules: response.rules,
                skipped: response.skipped,
                warning: response.warning,
            },
        });
    });

    test("rejects relative and glob output paths as unusable", async () => {
        const result = await getOpenSpecInstructions(
            "research",
            "example",
            "/project",
            captureJson({
                ...completeInstructions,
                artifactId: "research",
                resolvedOutputPath: "specs/**/*.md",
            }),
        );

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toContain("OPENSPEC_OUTPUT_PATH_INVALID");
    });

    test("accepts a pending artifact whose parent exists but target file does not", async () => {
        await withTempDir(async dir => {
            const pendingPath = path.join(dir, "new-artifact.md");
            const result = await getOpenSpecInstructions(
                "proposal",
                "example",
                dir,
                captureJson({ ...completeInstructions, resolvedOutputPath: pendingPath }),
            );
            expect(result.ok).toBe(true);
            expect(await Bun.file(pendingPath).exists()).toBe(false);
        });
    });

    test("accepts an existing file output path", async () => {
        const result = await getOpenSpecInstructions(
            "proposal",
            "example",
            process.cwd(),
            captureJson({
                ...completeInstructions,
                resolvedOutputPath: path.join(process.cwd(), "README.md"),
            }),
        );
        expect(result.ok).toBe(true);
    });

    test("rejects a relative output path", async () => {
        const result = await getOpenSpecInstructions(
            "proposal",
            "example",
            process.cwd(),
            captureJson({ ...completeInstructions, resolvedOutputPath: "relative/artifact.md" }),
        );
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toContain("OPENSPEC_OUTPUT_PATH_INVALID");
    });

    test("rejects an output path whose parent directory does not exist", async () => {
        const result = await getOpenSpecInstructions(
            "proposal",
            "example",
            process.cwd(),
            captureJson({
                ...completeInstructions,
                resolvedOutputPath: path.join(process.cwd(), "missing-parent", "artifact.md"),
            }),
        );
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error).toContain("OPENSPEC_OUTPUT_PATH_INVALID");
            expect(result.error).toContain("openspec instructions proposal --change example");
        }
    });

    test("reports capture failures", async () => {
        const result = await getOpenSpecInstructions(
            "proposal",
            "example",
            "/project",
            async () => {
                throw new Error("spawn openspec ENOENT");
            },
        );

        expect(result).toEqual({
            ok: false,
            error: "Unable to run OpenSpec instructions: spawn openspec ENOENT",
        });
    });

    test("reports a terminated process", async () => {
        const result = await getOpenSpecInstructions(
            "proposal",
            "example",
            "/project",
            async () => ({
                stdout: "result unavailable",
                exitCode: null,
            }),
        );

        expect(result).toEqual({
            ok: false,
            error: "OpenSpec instructions was terminated before returning a result",
        });
    });

    test("reports invalid JSON including stdout", async () => {
        const result = await getOpenSpecInstructions(
            "proposal",
            "example",
            "/project",
            async () => ({
                stdout: "not json",
                exitCode: 0,
            }),
        );

        expect(result).toEqual({
            ok: false,
            error: "OpenSpec instructions returned invalid JSON: not json",
        });
    });

    test.each(["[]", JSON.stringify("unexpected"), "null"])(
        "reports an invalid top-level result for %s",
        async stdout => {
            const result = await getOpenSpecInstructions(
                "proposal",
                "example",
                "/project",
                async () => ({
                    stdout,
                    exitCode: 0,
                }),
            );

            expect(result.ok).toBe(false);
            if (!result.ok) expect(result.error).toContain("OPENSPEC_MALFORMED_RESPONSE");
        },
    );

    test("reports a missing required field without a partial result", async () => {
        const { instruction: _instruction, ...missingInstruction } = completeInstructions;
        const result = await getOpenSpecInstructions(
            "proposal",
            "example",
            "/project",
            captureJson(missingInstruction),
        );

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toContain("OPENSPEC_MALFORMED_RESPONSE");
        expect(result.ok).toBe(false);
    });

    test("surfaces the first status message and fix on command failure", async () => {
        const result = await getOpenSpecInstructions(
            "proposal",
            "example",
            "/project",
            captureJson(
                {
                    status: [
                        { message: "Artifact could not be read", fix: "Check the artifact id" },
                        { message: "Do not use this message" },
                    ],
                },
                1,
            ),
        );

        expect(result).toEqual({
            ok: false,
            error: "Artifact could not be read Fix: Check the artifact id",
        });
    });

    test("does not return a partial result for a malformed dependency", async () => {
        const result = await getOpenSpecInstructions(
            "proposal",
            "example",
            "/project",
            captureJson({ ...completeInstructions, dependencies: [{ id: "research" }] }),
        );

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toContain("OPENSPEC_MALFORMED_RESPONSE");
    });
});
