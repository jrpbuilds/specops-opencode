import type { ToolContext } from "@opencode-ai/plugin/tool";
import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import * as helpers from "../../src/helpers.js";
import { reviewGuardTool } from "../../src/host/tools/review-guard.js";
import { withTempDir } from "../helpers.js";

type AskRequest = Parameters<ToolContext["ask"]>[0];
type MetadataRequest = Parameters<ToolContext["metadata"]>[0];

function toolContext(
    directory: string,
    ask: ToolContext["ask"],
    metadata: ToolContext["metadata"],
): ToolContext {
    return {
        sessionID: "test-session",
        messageID: "test-message",
        agent: "SpecOps",
        directory,
        worktree: directory,
        abort: new AbortController().signal,
        ask,
        metadata,
    };
}

/** Mock git so the wrapper resolves the temp root and finds no tracked files. */
function mockGit(directory: string): void {
    spyOn(helpers, "runCaptureStdout").mockImplementation(async (command, args) => {
        if (command !== "git") throw new Error(`unexpected command: ${command}`);
        if (args[0] === "rev-parse") return { stdout: directory, exitCode: 0 };
        return { stdout: "", exitCode: 0 };
    });
}

function outputOf(result: Awaited<ReturnType<typeof reviewGuardTool.execute>>): string {
    return typeof result === "string" ? result : result.output;
}

afterEach(() => {
    mock.restore();
});

describe("specops_review_guard tool wrapper", () => {
    test("rejects arguments outside the exact {operation, change} contract", async () => {
        for (const args of [
            {},
            { operation: "capture" },
            { change: "example" },
            { operation: "capture", change: "example", extra: true },
            { operation: "verify", change: "" },
            { operation: "verify", change: "   " },
            { operation: "archive", change: "example" },
            { operation: 42, change: "example" },
            { operation: "capture", change: 42 },
            { operation: ["capture"], change: "example" },
        ]) {
            await expect(
                reviewGuardTool.execute(
                    args as never,
                    toolContext(
                        "/tmp",
                        async () => {},
                        () => {},
                    ),
                ),
            ).rejects.toThrow("specops_review_guard expects exactly");
        }
    });

    test("accepts both operations and dispatches through the lifecycle gate", async () => {
        await withTempDir(async dir => {
            const requests: AskRequest[] = [];
            const metadataRequests: MetadataRequest[] = [];
            const context = toolContext(
                dir,
                async request => {
                    requests.push(request);
                },
                metadata => {
                    metadataRequests.push(metadata);
                },
            );
            mockGit(dir);

            // Verify before any capture fails closed on missingBaseline.
            const missing = await reviewGuardTool.execute(
                { operation: "verify", change: "example" },
                context,
            );
            expect(JSON.parse(outputOf(missing))).toEqual({
                mutated: false,
                missingBaseline: true,
                violations: [],
            });

            const captureResult = await reviewGuardTool.execute(
                { operation: "capture", change: "example" },
                context,
            );
            expect(JSON.parse(outputOf(captureResult))).toMatchObject({
                operation: "capture",
                change: "example",
                root: dir,
                trackedCount: 0,
                openspecCount: 0,
            });

            const verifyResult = await reviewGuardTool.execute(
                { operation: "verify", change: "example" },
                context,
            );
            expect(JSON.parse(outputOf(verifyResult))).toEqual({
                mutated: false,
                violations: [],
            });

            expect(requests).toEqual(
                Array.from({ length: 3 }, () => ({
                    permission: "specops_lifecycle",
                    patterns: ["specops_review_guard"],
                    always: ["specops_review_guard"],
                    metadata: { tool: "specops_review_guard" },
                })),
            );
            expect(metadataRequests).toEqual([
                { title: "Verifying review guard baseline…" },
                { title: "Capturing review guard baseline…" },
                { title: "Verifying review guard baseline…" },
            ]);
        });
    });

    test("requests lifecycle permission before metadata or side effects", async () => {
        await withTempDir(async dir => {
            const requests: AskRequest[] = [];
            const metadataRequests: MetadataRequest[] = [];
            const context = toolContext(
                dir,
                async request => {
                    requests.push(request);
                },
                metadata => {
                    metadataRequests.push(metadata);
                },
            );
            mockGit(dir);

            await reviewGuardTool.execute({ operation: "capture", change: "example" }, context);

            expect(requests).toEqual([
                {
                    permission: "specops_lifecycle",
                    patterns: ["specops_review_guard"],
                    always: ["specops_review_guard"],
                    metadata: { tool: "specops_review_guard" },
                },
            ]);
            expect(metadataRequests).toEqual([{ title: "Capturing review guard baseline…" }]);
        });
    });

    test("stops before metadata or side effects when lifecycle permission is denied", async () => {
        await withTempDir(async dir => {
            let metadataCalls = 0;
            const denial = new Error("lifecycle denied");
            const context = toolContext(
                dir,
                async () => {
                    throw denial;
                },
                () => {
                    metadataCalls += 1;
                },
            );
            const git = spyOn(helpers, "runCaptureStdout");

            await expect(
                reviewGuardTool.execute({ operation: "capture", change: "example" }, context),
            ).rejects.toBe(denial);
            expect(metadataCalls).toBe(0);
            expect(git).not.toHaveBeenCalled();
        });
    });
});
