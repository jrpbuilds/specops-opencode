import { describe, expect, test } from "bun:test";
import { context, type ContextDeps } from "../../src/tools/context.js";

function deps(overrides: Partial<ContextDeps> = {}): ContextDeps {
    return {
        getContext: async () => ({ available: true, initialized: true, activeChanges: [] }),
        ...overrides,
    };
}

describe("context", () => {
    test("returns only the deterministic OpenSpec context payload", async () => {
        const result = await context(
            deps({
                getContext: async () => ({
                    available: true,
                    initialized: true,
                    activeChanges: [
                        {
                            name: "add-score-screen",
                            status: "no-tasks",
                            completedTasks: 0,
                            totalTasks: 0,
                            lastModified: "2026-08-09T10:00:00.000Z",
                        },
                    ],
                }),
            }),
        );

        expect(JSON.parse(result)).toEqual({
            available: true,
            initialized: true,
            activeChanges: [
                {
                    name: "add-score-screen",
                    status: "no-tasks",
                    completedTasks: 0,
                    totalTasks: 0,
                    lastModified: "2026-08-09T10:00:00.000Z",
                },
            ],
        });
    });

    test("preserves context errors for the Coordinator", async () => {
        const result = await context(
            deps({
                getContext: async () => ({
                    available: true,
                    initialized: false,
                    activeChanges: [],
                    error: "OpenSpec list returned invalid JSON",
                }),
            }),
        );

        expect(JSON.parse(result)).toMatchObject({
            available: true,
            initialized: false,
            error: "OpenSpec list returned invalid JSON",
        });
    });
});
