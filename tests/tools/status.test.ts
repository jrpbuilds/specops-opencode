import type { ToolContext } from "@opencode-ai/plugin/tool";
import { describe, expect, test } from "bun:test";
import { status, type StatusDeps } from "../../src/tools/status.js";
import { statusTool } from "../../src/host/tools/status.js";
import type { ApplyInstructionsResult } from "../../src/openspec/apply-instructions.js";

const normalizedStatus = {
    changeName: "example",
    schemaName: "spec-driven",
    isPlanningComplete: true,
    applyRequires: ["proposal"],
    artifacts: [
        {
            id: "proposal",
            outputPath: "openspec/changes/example/proposal.md",
            status: "done" as const,
            requires: [],
            missingDeps: [],
        },
    ],
};

const applyContext = {
    changeName: "example",
    changeDir: "openspec/changes/example",
    schemaName: "spec-driven",
    contextFiles: { proposal: ["openspec/changes/example/proposal.md"] },
    progress: { total: 2, complete: 1, remaining: 1 },
    tasks: [
        { id: "1.1", description: "First task", done: true },
        { id: "1.2", description: "Second task", done: false },
    ],
    state: "ready" as const,
    instruction: "Work through pending tasks.",
};

function deps(overrides: Partial<StatusDeps> = {}): StatusDeps {
    return {
        getOpenSpecStatus: async () => ({ ok: true, status: normalizedStatus }),
        getApplyInstructions: async () => ({ ok: true, context: applyContext }),
        ...overrides,
    };
}

function toolContext(
    ask: ToolContext["ask"],
    metadata: ToolContext["metadata"] = () => {},
): ToolContext {
    return {
        sessionID: "test-session",
        messageID: "test-message",
        agent: "test-agent",
        directory: "/project",
        worktree: "/project",
        abort: new AbortController().signal,
        ask,
        metadata,
    };
}

describe("status", () => {
    test("rejects an empty change name without invoking OpenSpec", async () => {
        let statusCalled = false;
        let applyCalled = false;
        const result = await status("  ", {
            getOpenSpecStatus: async () => {
                statusCalled = true;
                return { ok: false, error: "should not be called" };
            },
            getApplyInstructions: async () => {
                applyCalled = true;
                return { ok: false, error: "should not be called" } as ApplyInstructionsResult;
            },
        });

        expect(result).toContain("change name is required");
        expect(statusCalled).toBe(false);
        expect(applyCalled).toBe(false);
    });

    test("returns successful results with phase and lifecycle legality merged in", async () => {
        let received: string | undefined;
        const result = await status(
            "  example  ",
            deps({
                getOpenSpecStatus: async change => {
                    received = change;
                    return { ok: true, status: normalizedStatus };
                },
                getApplyInstructions: async change => {
                    received = change;
                    return { ok: true, context: applyContext };
                },
            }),
        );

        expect(received).toBe("example");
        expect(JSON.parse(result)).toEqual({
            ...normalizedStatus,
            phase: "implementation",
            lifecycle: {
                implement: { allowed: true },
                review: { allowed: false, reason: "implementation-incomplete" },
            },
        });
        expect(result).not.toContain("recommend");
    });

    test("reports the review phase with both capabilities allowed once tasks complete", async () => {
        const result = await status(
            "example",
            deps({
                getApplyInstructions: async () => ({
                    ok: true,
                    context: {
                        ...applyContext,
                        state: "all_done",
                        progress: { total: 2, complete: 2, remaining: 0 },
                        tasks: applyContext.tasks.map(task => ({ ...task, done: true })),
                    },
                }),
            }),
        );

        expect(JSON.parse(result)).toEqual({
            ...normalizedStatus,
            phase: "review",
            lifecycle: { implement: { allowed: true }, review: { allowed: true } },
        });
    });

    test("returns status read failures with a deterministic prefix", async () => {
        const result = await status(
            "missing",
            deps({
                getOpenSpecStatus: async () => ({
                    ok: false,
                    error: "OpenSpec status failed with exit code 1",
                }),
            }),
        );

        expect(result).toBe(
            "Failed to read OpenSpec status for 'missing': OpenSpec status failed with exit code 1",
        );
        expect(() => JSON.parse(result)).toThrow();
    });

    test("fails closed without partial output when the task-state read fails", async () => {
        const result = await status(
            "example",
            deps({
                getApplyInstructions: async () => ({
                    ok: false,
                    error: "OpenSpec instructions apply returned invalid JSON",
                }),
            }),
        );

        expect(result).toBe(
            "Failed to read OpenSpec task state for 'example': " +
                "OpenSpec instructions apply returned invalid JSON",
        );
        expect(() => JSON.parse(result)).toThrow();
    });

    test("requests specops_status permission exactly once before doing any work", async () => {
        const requests: unknown[] = [];
        const denial = new Error("lifecycle denied");
        const context = toolContext(
            async request => {
                requests.push(request);
                throw denial;
            },
            () => {
                throw new Error("work started before permission was granted");
            },
        );

        await expect(statusTool.execute({ change: "example" }, context)).rejects.toBe(denial);
        expect(requests).toEqual([
            {
                permission: "specops_lifecycle",
                patterns: ["specops_status"],
                always: ["specops_status"],
                metadata: { tool: "specops_status" },
            },
        ]);
    });
});
