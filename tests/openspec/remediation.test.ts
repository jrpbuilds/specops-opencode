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
    targetVersion: "1.10.0",
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

    test("leads incompatible remediation with the failing capability and both fix paths", () => {
        const output = formatRemediation("OPENSPEC_INCOMPATIBLE", details);
        const firstLine = output.split("\n", 1)[0];

        expect(firstLine).toContain("validate-strict-scoped");
        expect(firstLine).not.toContain("minimum");
        expect(output).toContain("Install or upgrade to the latest OpenSpec");
        expect(output).toContain("ensure your OpenSpec install exposes the failing capability");
        expect(output).toContain("Re-run specops_doctor");
    });

    test("reports malformed response shapes without an upgrade-first instruction", () => {
        const output = formatRemediation("OPENSPEC_MALFORMED_RESPONSE", details);

        expect(output).toContain("Report the response shape to SpecOps");
        expect(output).toContain(
            "update the supported contract if newer fields should be consumed",
        );
        expect(output).not.toContain("  2. Upgrade OpenSpec");
    });
});
