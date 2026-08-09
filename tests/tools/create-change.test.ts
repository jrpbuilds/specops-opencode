import { describe, expect, test } from "bun:test";
import { createChange, type CreateChangeDeps } from "../../src/tools/create-change.js";

function deps(overrides: Partial<CreateChangeDeps> = {}): CreateChangeDeps {
    return {
        createChange: async change => ({
            ok: true,
            name: change,
            path: `/project/openspec/changes/${change}`,
        }),
        ...overrides,
    };
}

describe("createChange", () => {
    test("rejects an empty name without invoking OpenSpec", async () => {
        let called = false;
        const result = await createChange("  ", undefined, {
            createChange: async () => {
                called = true;
                return { ok: false, error: "should not be called" };
            },
        });

        expect(result).toContain("change name is required");
        expect(called).toBe(false);
    });

    test("trims the name and passes a useful goal without renaming it", async () => {
        let received: { change: string; goal?: string } | undefined;
        const result = await createChange(
            "  improve-bird-graphics  ",
            "  Improve the bird graphics  ",
            deps({
                createChange: async (change, goal) => {
                    received = { change, goal };
                    return {
                        ok: true,
                        name: change,
                        path: "/project/openspec/changes/improve-bird-graphics",
                    };
                },
            }),
        );

        expect(received).toEqual({
            change: "improve-bird-graphics",
            goal: "Improve the bird graphics",
        });
        expect(result).toContain("improve-bird-graphics");
    });

    test("reports native failure without retrying", async () => {
        let calls = 0;
        const result = await createChange(
            "existing-change",
            undefined,
            deps({
                createChange: async () => {
                    calls += 1;
                    return { ok: false, error: "Change already exists" };
                },
            }),
        );

        expect(result).toContain("Change already exists");
        expect(calls).toBe(1);
    });
});
