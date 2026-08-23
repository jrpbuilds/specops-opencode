import type { ChangeValidation } from "../openspec/validate.js";
import { formatRemediation } from "../openspec/remediation.js";

/** Tool-facing validation outcome with remediation guidance attached on failure. */
export type ValidateChangeResult =
    | { valid: true; issues: [] }
    | {
          valid: false;
          issues: ChangeValidation["issues"];
          remediation: string;
      };

/** Dependency boundary keeping validation deterministic and host-free. */
export type ValidateChangeDeps = {
    validateChange: (change: string) => Promise<ChangeValidation>;
};

/** Run scoped strict validation and attach the standard remediation on failure. */
export async function validateChange(
    change: string,
    deps: ValidateChangeDeps,
): Promise<ValidateChangeResult> {
    assertChangeName(change);
    try {
        const result = await deps.validateChange(change.trim());
        if (result.valid) return { valid: true, issues: [] };

        return {
            valid: false,
            issues: result.issues,
            remediation: formatRemediation("OPENSPEC_VALIDATION_FAILED", {
                change: change.trim(),
                issues: formatIssues(result.issues),
            }),
        };
    } catch (error) {
        const issues = [
            {
                level: "error",
                path: "openspec validate",
                message: error instanceof Error ? error.message : String(error),
            },
        ];
        return {
            valid: false,
            issues,
            remediation: formatRemediation("OPENSPEC_VALIDATION_FAILED", {
                change: change.trim(),
                issues: formatIssues(issues),
            }),
        };
    }
}

/** Reject empty or non-string change names before any work happens. */
function assertChangeName(change: string): void {
    if (typeof change !== "string" || !change.trim()) {
        throw new Error("An OpenSpec change name is required.");
    }
}

/** Render validation issues as one compact line for the tool response. */
function formatIssues(issues: ChangeValidation["issues"]): string {
    return (
        issues.map(issue => `${issue.path}: ${issue.message}`).join("; ") ||
        "OpenSpec reported a validation violation"
    );
}
