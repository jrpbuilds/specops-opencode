import type { ToolContext } from "@opencode-ai/plugin/tool";
import { describe, expect, test } from "bun:test";
import { status, statusTool, type StatusDeps } from "../../src/tools/status.js";

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

function deps(overrides: Partial<StatusDeps> = {}): StatusDeps {
    return {
        getOpenSpecStatus: async () => ({ ok: true, status: normalizedStatus }),
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
        let called = false;
        const result = await status("  ", {
            getOpenSpecStatus: async () => {
                called = true;
                return { ok: false, error: "should not be called" };
            },
        });

        expect(result).toContain("change name is required");
        expect(called).toBe(false);
    });

    test("returns successful wrapper results as normalized JSON", async () => {
        let received: string | undefined;
        const result = await status(
            "  example  ",
            deps({
                getOpenSpecStatus: async change => {
                    received = change;
                    return { ok: true, status: normalizedStatus };
                },
            }),
        );

        expect(received).toBe("example");
        expect(JSON.parse(result)).toEqual(normalizedStatus);
        expect(result).not.toContain("recommend");
    });

    test("returns wrapper failures with a deterministic prefix", async () => {
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
