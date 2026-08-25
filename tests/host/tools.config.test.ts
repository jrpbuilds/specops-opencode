import type { ToolContext } from "@opencode-ai/plugin/tool";
import { afterAll, describe, expect, test } from "bun:test";
import type { SpecOpsConfig } from "../../src/config.js";
import {
    __resetProcessConfigForTesting,
    getProcessConfig,
    setProcessConfig,
} from "../../src/host/config-snapshot.js";
import { configTool } from "../../src/host/tools/config.js";

type ToolResult = Awaited<ReturnType<typeof configTool.execute>>;

function outputOf(result: ToolResult): string {
    return typeof result === "string" ? result : result.output;
}

/**
 * Minimal config satisfying SpecOpsConfig's structural shape; only the
 * top-level fields exposed by the tool are exercised here.
 */
function makeConfig(overrides: Partial<SpecOpsConfig> = {}): SpecOpsConfig {
    return {
        agents: {},
        frontierEscalation: false,
        ...overrides,
    } as unknown as SpecOpsConfig;
}

function toolContext(ask: ToolContext["ask"]): ToolContext {
    return {
        sessionID: "test-session",
        messageID: "test-message",
        agent: "SpecOps",
        directory: "/project",
        worktree: "/project",
        abort: new AbortController().signal,
        ask,
        metadata: () => {},
    };
}

describe("specops_config host wrapper", () => {
    afterAll(() => {
        __resetProcessConfigForTesting();
    });

    test("returns the stringified CoordinatorConfigView for a coordinator", async () => {
        setProcessConfig(
            makeConfig({
                frontierEscalation: true,
                maxSubagentConcurrency: 8,
                maxAutoReviewIterations: 2,
            }),
        );
        const requests: unknown[] = [];

        const result = await configTool.execute(
            {},
            toolContext(async request => {
                requests.push(request);
            }),
        );

        expect(requests).toEqual([
            {
                permission: "specops_lifecycle",
                patterns: ["specops_config"],
                always: ["specops_config"],
                metadata: { tool: "specops_config" },
            },
        ]);
        const parsed = JSON.parse(outputOf(result)) as Record<string, unknown>;
        expect(parsed).toEqual({
            maxSubagentConcurrency: 8,
            maxAutoReviewIterations: 2,
            frontierEscalation: true,
        });
    });

    test("stops before reading config when permission is denied", async () => {
        setProcessConfig(makeConfig());
        const denial = new Error("lifecycle denied");
        let metadataCalls = 0;

        await expect(
            configTool.execute(
                {},
                {
                    ...toolContext(async () => {
                        throw denial;
                    }),
                    metadata: () => {
                        metadataCalls += 1;
                    },
                },
            ),
        ).rejects.toBe(denial);
        expect(metadataCalls).toBe(0);
    });

    test("produces byte-identical output across repeated calls (no write path)", async () => {
        setProcessConfig(
            makeConfig({
                maxSubagentConcurrency: 5,
                maxAutoReviewIterations: 3,
                frontierEscalation: false,
            }),
        );
        const grant = toolContext(async () => {});

        const first = outputOf(await configTool.execute({}, grant));
        const second = outputOf(await configTool.execute({}, grant));
        expect(second).toBe(first);
    });

    test("captures a frozen snapshot: post-init mutation of the original object does not affect output", async () => {
        const config = makeConfig({ maxSubagentConcurrency: 4 });
        setProcessConfig(config);

        // The holder deep-clones on set, so the captured snapshot is a
        // distinct object that survives mutation of the caller's reference.
        expect(getProcessConfig()).not.toBe(config);

        // Mutate the caller's reference after the snapshot was captured.
        config.maxSubagentConcurrency = 99;
        config.frontierEscalation = true;

        const result = outputOf(
            await configTool.execute(
                {},
                toolContext(async () => {}),
            ),
        );
        const parsed = JSON.parse(result) as Record<string, unknown>;
        expect(parsed.maxSubagentConcurrency).toBe(4);
        expect(parsed.frontierEscalation).toBe(false);
    });

    test("throws when the process snapshot has not been initialized", async () => {
        __resetProcessConfigForTesting();

        await expect(
            configTool.execute(
                {},
                toolContext(async () => {}),
            ),
        ).rejects.toThrow(/not initialized/);

        // Restore a snapshot for subsequent tests in this file.
        setProcessConfig(makeConfig());
    });
});
