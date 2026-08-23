import { describe, expect, test } from "bun:test";
import { validateChange, type ValidateChangeDeps } from "../../src/tools/validate-change.js";

function deps(
    result: Awaited<ReturnType<ValidateChangeDeps["validateChange"]>>,
): ValidateChangeDeps {
    return { validateChange: async () => result };
}

describe("validateChange", () => {
    test("returns a structured success result", async () => {
        await expect(
            validateChange("  example  ", deps({ valid: true, issues: [] })),
        ).resolves.toEqual({
            valid: true,
            issues: [],
        });
    });

    test("returns violations and actionable remediation on failure", async () => {
        const issues = [{ level: "error", path: "tasks.md", message: "missing checkbox" }];
        const result = await validateChange("example", deps({ valid: false, issues }));
        expect(result).toMatchObject({ valid: false, issues });
        if (!result.valid) {
            expect(result.remediation).toContain("OPENSPEC_VALIDATION_FAILED");
            expect(result.remediation).toContain("tasks.md: missing checkbox");
            expect(result.remediation).toContain("openspec validate example --strict");
        }
    });

    test("rejects an empty change before invoking OpenSpec", async () => {
        let called = false;
        const operation = validateChange("   ", {
            validateChange: async () => {
                called = true;
                return { valid: true, issues: [] };
            },
        });

        await expect(operation).rejects.toThrow("An OpenSpec change name is required.");
        expect(called).toBe(false);
    });
});
