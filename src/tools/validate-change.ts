import type { ChangeValidation } from "../openspec/validate.js";
import { formatRemediation } from "../openspec/remediation.js";

/** Tool-facing validation outcome with remediation guidance attached on failure. */
export type ValidateChangeResult =
    | { valid: true; issues: [] }
    | {
          valid: false;
          planningIncomplete: true;
          action: "continue_planning";
          issues: ChangeValidation["issues"];
          remediation: string;
      }
    | {
          valid: false;
          action: "block";
          issues: ChangeValidation["issues"];
          remediation: string;
      };

/**
 * Dependency boundary keeping validation deterministic and host-free.
 *
 * `countDeltas` classifies a failed change as mid-planning when its parsed
 * delta count is zero; failures of the counter itself fall back to blocking.
 */
export type ValidateChangeDeps = {
    validateChange: (change: string) => Promise<ChangeValidation>;
    countDeltas: (change: string) => Promise<number>;
};

/** Run scoped strict validation and attach the standard remediation on failure. */
export async function validateChange(
    change: string,
    deps: ValidateChangeDeps,
): Promise<ValidateChangeResult> {
    assertChangeName(change);
    try {
        const trimmed = change.trim();
        const result = await deps.validateChange(trimmed);
        if (result.valid) return { valid: true, issues: [] };

        if (await isPlanningIncomplete(trimmed, deps)) {
            return {
                valid: false,
                planningIncomplete: true,
                action: "continue_planning",
                issues: result.issues,
                remediation: formatRemediation("OPENSPEC_PLANNING_INCOMPLETE", {
                    change: trimmed,
                }),
            };
        }

        return {
            valid: false,
            action: "block",
            issues: result.issues,
            remediation: formatRemediation("OPENSPEC_VALIDATION_FAILED", {
                change: trimmed,
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
            action: "block",
            issues,
            remediation: formatRemediation("OPENSPEC_VALIDATION_FAILED", {
                change: change.trim(),
                issues: formatIssues(issues),
            }),
        };
    }
}

/**
 * Whether a failing change only lacks first-pass deltas.
 *
 * Zero parsed deltas means strict validation cannot pass yet by design, so
 * the failure is reported as expected mid-planning state. A broken or
 * malformed count must never soften a real violation, so any error here
 * keeps the blocking classification.
 *
 * This heuristic is deliberately separate from the canonical
 * `derivePlanningCompletion` predicate: it answers a different question —
 * "did OpenSpec strict validation fail only because no deltas exist yet?" —
 * from different evidence (parsed delta counts, not the artifact graph), and
 * runs without a workflow-status read. It classifies validation failures; it
 * does not derive workflow legality.
 */
async function isPlanningIncomplete(change: string, deps: ValidateChangeDeps): Promise<boolean> {
    try {
        return (await deps.countDeltas(change)) === 0;
    } catch {
        return false;
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
