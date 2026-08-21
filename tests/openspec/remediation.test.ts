import { describe, expect, test } from "bun:test";
import { formatRemediation, type OpenSpecErrorCode } from "../../src/openspec/remediation.js";

const details = {
    wrapper: "openspec instructions",
    field: "resolvedOutputPath",
    expected: "string",
    observed: "undefined",
    path: "/missing/output.md",
    id: "proposal",
    change: "example",
    issues: "tasks.md: missing checkbox",
    missingCapabilities: "validate-strict-scoped",
    installedVersion: "1.7.0",
    minimumVersion: "1.8.0",
};

describe("formatRemediation", () => {
    test.each([
        ["OPENSPEC_UNAVAILABLE", "Install OpenSpec", "specops_doctor"],
        ["OPENSPEC_INCOMPATIBLE", "validate-strict-scoped", "bun install -g"],
        ["OPENSPEC_MALFORMED_RESPONSE", "resolvedOutputPath", "openspec-compatibility"],
        ["OPENSPEC_OUTPUT_PATH_INVALID", "/missing/output.md", "openspec instructions proposal"],
        [
            "OPENSPEC_VALIDATION_FAILED",
            "tasks.md: missing checkbox",
            "openspec validate example --strict",
        ],
    ] as const)("formats %s with actionable details", (code, summary, fix) => {
        const output = formatRemediation(code as OpenSpecErrorCode, details);
        expect(output.split("\n", 1)[0]).toContain(code);
        expect(output).toContain(summary);
        expect(output).toContain("Fix:");
        expect(output).toMatch(/\n  1\./);
        expect(output).toContain(fix);
    });
});
