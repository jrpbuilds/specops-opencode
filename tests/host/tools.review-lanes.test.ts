import type { ToolContext } from "@opencode-ai/plugin/tool";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG } from "../../src/config.js";
import {
    __resetProcessConfigForTesting,
    setProcessConfig,
} from "../../src/host/config-snapshot.js";
import {
    __resetSessionBindingsForTesting,
    getSessionBinding,
} from "../../src/host/session-bindings.js";
import { reviewLanesTool } from "../../src/host/tools/review-lanes.js";

type ToolResult = Awaited<ReturnType<typeof reviewLanesTool.execute>>;

/** Normalize OpenCode's string-or-object tool return for assertions. */
function outputOf(result: ToolResult): string {
    return typeof result === "string" ? result : result.output;
}

/** Parse the JSON portion before the standard optional refresh marker. */
function parseOutput(result: ToolResult): Record<string, unknown> {
    return JSON.parse(outputOf(result).split("\n\nSPECOPS_TODO_REFRESH:")[0]) as Record<
        string,
        unknown
    >;
}

/** Build a minimal OpenCode context for the runtime lane-management tool. */
function toolContext(ask: ToolContext["ask"]): ToolContext {
    return {
        sessionID: "review-lanes-tool-session",
        messageID: "review-lanes-tool-message",
        agent: "SpecOps",
        directory: "/project",
        worktree: "/project",
        abort: new AbortController().signal,
        ask,
        metadata: () => {},
    };
}

beforeEach(() => {
    setProcessConfig(DEFAULT_CONFIG);
    __resetSessionBindingsForTesting();
});

afterEach(() => {
    __resetSessionBindingsForTesting();
    __resetProcessConfigForTesting();
});

describe("specops_review_lanes host tool", () => {
    test("registers a complete lane plan and reports runtime capacity", async () => {
        const requests: unknown[] = [];
        const context = toolContext(async request => {
            requests.push(request);
        });
        const started = parseOutput(
            await reviewLanesTool.execute(
                {
                    operation: "start",
                    change: "example",
                    lanes: [
                        { id: "C1", lens: "correctness", scope: "frontend" },
                        { id: "C2", lens: "correctness", scope: "backend" },
                        { id: "R1", lens: "risk", scope: "auth" },
                        { id: "R2", lens: "risk", scope: "migration" },
                    ],
                },
                context,
            ),
        );
        expect(requests).toEqual([
            {
                permission: "specops_lifecycle",
                patterns: ["specops_review_lanes"],
                always: ["specops_review_lanes"],
                metadata: { tool: "specops_review_lanes" },
            },
        ]);
        expect(started.active).toBe(true);
        expect(started.fanInComplete).toBe(false);
        expect(started.availableCapacity).toBe(DEFAULT_CONFIG.maxSubagentConcurrency);
        expect((started.lanes as unknown[]).length).toBe(4);

        const status = parseOutput(
            await reviewLanesTool.execute(
                {
                    operation: "status",
                    change: "example",
                    roundId: started.roundId as string,
                },
                context,
            ),
        );
        expect(status.roundId).toBe(started.roundId);
        expect(status.counts).toEqual({ pending: 4, inFlight: 0, completed: 0, failed: 0 });

        const reset = parseOutput(
            await reviewLanesTool.execute(
                {
                    operation: "reset",
                    change: "example",
                    roundId: started.roundId as string,
                },
                context,
            ),
        );
        expect(reset).toEqual({ active: false, change: "example", cleared: true });
    });

    test("rejects malformed lane plans and stale status requests with useful errors", async () => {
        const context = toolContext(async () => {});
        await expect(
            reviewLanesTool.execute(
                {
                    operation: "start",
                    change: "example",
                    lanes: [{ id: "C1", lens: "security", scope: "auth" }],
                },
                context,
            ),
        ).rejects.toThrow("expected correctness, risk, or quality");

        await expect(
            reviewLanesTool.execute(
                { operation: "status", change: "example", roundId: "stale-round" },
                context,
            ),
        ).rejects.toThrow("Stale or missing review round");
    });

    test("a wrong-change status request preserves the active binding and round", async () => {
        const context = toolContext(async () => {});
        const started = parseOutput(
            await reviewLanesTool.execute(
                {
                    operation: "start",
                    change: "example",
                    lanes: [{ id: "C1", lens: "correctness", scope: "frontend" }],
                },
                context,
            ),
        );

        await expect(
            reviewLanesTool.execute(
                {
                    operation: "status",
                    change: "another-change",
                    roundId: started.roundId as string,
                },
                context,
            ),
        ).rejects.toThrow("does not match the active session change 'example'");

        expect(getSessionBinding(context.sessionID)?.change).toBe("example");
        const status = parseOutput(
            await reviewLanesTool.execute(
                {
                    operation: "status",
                    change: "example",
                    roundId: started.roundId as string,
                },
                context,
            ),
        );
        expect(status.roundId).toBe(started.roundId);
    });
});
