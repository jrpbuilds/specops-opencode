import { describe, expect, test } from "bun:test";
import { onboard, type OnboardDeps } from "../../src/tools/onboard.js";

function deps(overrides: Partial<OnboardDeps>): OnboardDeps {
    return {
        cwd: "/tmp/test",
        isAvailable: async () => true,
        isInitialized: async () => false,
        initialize: async () => ({ ok: true, stderr: "" }),
        ...overrides,
    };
}

describe("onboard", () => {
    test("reports OpenSpec is not installed when unavailable", async () => {
        const calls = { initialized: false, initializedCalled: false, initCalled: false };
        const result = await onboard(
            deps({
                isAvailable: async () => false,
                isInitialized: async () => {
                    calls.initializedCalled = true;
                    return calls.initialized;
                },
                initialize: async () => {
                    calls.initCalled = true;
                    return { ok: true, stderr: "" };
                },
            }),
        );
        expect(result).toContain("not installed");
        expect(calls.initializedCalled).toBe(false);
        expect(calls.initCalled).toBe(false);
    });

    test("reports already initialised when an OpenSpec root exists", async () => {
        const calls = { initCalled: false };
        const result = await onboard(
            deps({
                isInitialized: async () => true,
                initialize: async () => {
                    calls.initCalled = true;
                    return { ok: true, stderr: "" };
                },
            }),
        );
        expect(result).toContain("already initialised");
        expect(calls.initCalled).toBe(false);
    });

    test("initialises and reports success when the project is not initialized", async () => {
        const result = await onboard(
            deps({
                isInitialized: async () => false,
                initialize: async () => ({ ok: true, stderr: "" }),
            }),
        );
        expect(result).toContain("initialised successfully");
    });

    test("reports failure when init fails", async () => {
        const result = await onboard(
            deps({
                isInitialized: async () => false,
                initialize: async () => ({ ok: false, stderr: "permission denied" }),
            }),
        );
        expect(result).toContain("Failed to initialise OpenSpec");
        expect(result).toContain("permission denied");
    });
});
