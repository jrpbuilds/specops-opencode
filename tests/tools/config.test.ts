import { describe, expect, test } from "bun:test";
import {
    DEFAULT_AUTO_REVIEW_ITERATIONS,
    DEFAULT_SUBAGENT_CONCURRENCY,
    type SpecOpsConfig,
} from "../../src/config.js";
import { configView, type ConfigViewDeps } from "../../src/tools/config.js";

/**
 * Minimal config satisfying SpecOpsConfig's structural shape without coupling
 * these unit tests to the full agent catalogue. The deterministic builder only
 * reads the top-level fields it exposes, so per-agent entries can stay empty.
 */
function makeConfig(overrides: Partial<SpecOpsConfig> = {}): SpecOpsConfig {
    return {
        agents: {},
        frontierEscalation: false,
        ...overrides,
    } as unknown as SpecOpsConfig;
}

function deps(config: SpecOpsConfig, calls: number[] = []): ConfigViewDeps {
    return {
        getConfig: () => {
            calls.push(1);
            return config;
        },
    };
}

describe("configView", () => {
    test("returns the default view for an empty config", () => {
        const view = configView(deps(makeConfig()));

        expect(view).toEqual({
            maxSubagentConcurrency: DEFAULT_SUBAGENT_CONCURRENCY,
            maxAutoReviewIterations: DEFAULT_AUTO_REVIEW_ITERATIONS,
            frontierEscalation: false,
        });
    });

    test("echoes explicitly configured values without alteration", () => {
        const view = configView(
            deps(
                makeConfig({
                    frontierEscalation: true,
                    maxSubagentConcurrency: 8,
                    maxAutoReviewIterations: 2,
                }),
            ),
        );

        expect(view).toEqual({
            maxSubagentConcurrency: 8,
            maxAutoReviewIterations: 2,
            frontierEscalation: true,
        });
    });

    test("backfills missing maxSubagentConcurrency with the default", () => {
        const view = configView(deps(makeConfig({ maxAutoReviewIterations: 2 })));

        expect(view.maxSubagentConcurrency).toBe(DEFAULT_SUBAGENT_CONCURRENCY);
        expect(view.maxAutoReviewIterations).toBe(2);
    });

    test("backfills missing maxAutoReviewIterations with the default", () => {
        const view = configView(deps(makeConfig({ maxSubagentConcurrency: 8 })));

        expect(view.maxSubagentConcurrency).toBe(8);
        expect(view.maxAutoReviewIterations).toBe(DEFAULT_AUTO_REVIEW_ITERATIONS);
    });

    test("keeps frontierEscalation authoritative when numerics are absent", () => {
        const view = configView(deps(makeConfig({ frontierEscalation: true })));

        expect(view.frontierEscalation).toBe(true);
        expect(view.maxSubagentConcurrency).toBe(DEFAULT_SUBAGENT_CONCURRENCY);
        expect(view.maxAutoReviewIterations).toBe(DEFAULT_AUTO_REVIEW_ITERATIONS);
    });

    test("produces a stable, deterministic key order", () => {
        const calls: number[] = [];
        const view = configView(deps(makeConfig({ maxSubagentConcurrency: 5 }), calls));

        expect(Object.keys(view)).toEqual([
            "maxSubagentConcurrency",
            "maxAutoReviewIterations",
            "frontierEscalation",
        ]);
        expect(calls).toEqual([1]);
    });

    test("reads the config exactly once per call and does not mutate the input", () => {
        const calls: number[] = [];
        const config = makeConfig({
            frontierEscalation: true,
            maxSubagentConcurrency: 6,
            maxAutoReviewIterations: 1,
        });
        const snapshotBefore = structuredClone(config);

        const view = configView(deps(config, calls));

        expect(calls).toEqual([1]);
        expect(config).toEqual(snapshotBefore);
        // Mutating the returned view does not leak back into the source config.
        view.maxSubagentConcurrency = 99;
        expect(config.maxSubagentConcurrency).toBe(6);
    });
});
