import { describe, expect, test } from "bun:test";
import {
    getOpenSpecInstructions,
    type NormalizedInstructions,
} from "../../src/openspec/instructions.js";
import type { CaptureStdout } from "../../src/openspec/helpers.js";

function captureJson(value: unknown, exitCode = 0): CaptureStdout {
    return async () => ({ stdout: JSON.stringify(value), exitCode });
}

const completeInstructions = {
    artifactId: "proposal",
    outputPath: "proposal.md",
    resolvedOutputPath: "openspec/changes/example/proposal.md",
    template: "# Proposal",
    instruction: "Describe the change.",
    dependencies: [
        {
            id: "research",
            done: true,
            path: "research.md",
            description: "Repository research",
        },
    ],
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
                resolvedOutputPath: "openspec/changes/example/proposal.md",
                template: "# Proposal",
                instruction: "Describe the change.",
                dependencies: completeInstructions.dependencies,
            },
        });
    });

    test("normalizes optional fields when OpenSpec provides them", async () => {
        const response = {
            ...completeInstructions,
            context: "Use repository evidence.",
            rules: "Preserve completed artifacts.",
            skipped: true,
            warning: "This artifact is optional.",
        };

        const result = await getOpenSpecInstructions("proposal", "example", "/project", captureJson(response));

        expect(result).toEqual({
            ok: true,
            instructions: {
                id: "proposal",
                resolvedOutputPath: "openspec/changes/example/proposal.md",
                template: "# Proposal",
                instruction: "Describe the change.",
                dependencies: completeInstructions.dependencies,
                context: response.context,
                rules: response.rules,
                skipped: response.skipped,
                warning: response.warning,
            },
        });
    });

    test("passes glob output paths through without routing fields or filesystem access", async () => {
        const result = await getOpenSpecInstructions(
            "research",
            "example",
            "/project",
            captureJson({ ...completeInstructions, artifactId: "research", resolvedOutputPath: "specs/**/*.md" }),
        );

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.instructions.resolvedOutputPath).toBe("specs/**/*.md");
            expect("specialist" in result.instructions).toBe(false);
            expect("routing" in result.instructions).toBe(false);
            expect("workflow" in result.instructions).toBe(false);
            expect(result.instructions satisfies NormalizedInstructions).toBeDefined();
        }
    });

    test("reports capture failures", async () => {
        const result = await getOpenSpecInstructions("proposal", "example", "/project", async () => {
            throw new Error("spawn openspec ENOENT");
        });

        expect(result).toEqual({
            ok: false,
            error: "Unable to run OpenSpec instructions: spawn openspec ENOENT",
        });
    });

    test("reports a terminated process", async () => {
        const result = await getOpenSpecInstructions("proposal", "example", "/project", async () => ({
            stdout: "result unavailable",
            exitCode: null,
        }));

        expect(result).toEqual({
            ok: false,
            error: "OpenSpec instructions was terminated before returning a result",
        });
    });

    test("reports invalid JSON including stdout", async () => {
        const result = await getOpenSpecInstructions("proposal", "example", "/project", async () => ({
            stdout: "not json",
            exitCode: 0,
        }));

        expect(result).toEqual({
            ok: false,
            error: "OpenSpec instructions returned invalid JSON: not json",
        });
    });

    test.each(["[]", JSON.stringify("unexpected"), "null"])(
        "reports an invalid top-level result for %s",
        async stdout => {
            const result = await getOpenSpecInstructions("proposal", "example", "/project", async () => ({
                stdout,
                exitCode: 0,
            }));

            expect(result).toEqual({
                ok: false,
                error: "OpenSpec instructions returned an invalid result",
            });
        },
    );

    test("reports a missing required field without a partial result", async () => {
        const { template: _template, ...missingTemplate } = completeInstructions;
        const result = await getOpenSpecInstructions(
            "proposal",
            "example",
            "/project",
            captureJson(missingTemplate),
        );

        expect(result).toEqual({
            ok: false,
            error: "OpenSpec instructions failed with exit code 0",
        });
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

        expect(result).toEqual({
            ok: false,
            error: "OpenSpec instructions failed with exit code 0",
        });
    });
});
