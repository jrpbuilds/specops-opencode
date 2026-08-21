import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool";
import {
    validateChange as validateOpenSpecChange,
    type ChangeValidation,
} from "../openspec/validate.js";
import { formatRemediation } from "../openspec/remediation.js";
import { requireLifecyclePermission } from "./lifecycle-permission.js";

export type ValidateChangeResult =
    | { valid: true; issues: [] }
    | {
          valid: false;
          issues: ChangeValidation["issues"];
          remediation: string;
      };

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

/** Expose the scoped validation gate to coordinator agents. */
export const validateChangeTool: ToolDefinition = tool({
    description: "Validate one active OpenSpec change with strict, change-scoped validation.",
    args: {
        change: tool.schema.string(),
    },
    async execute(args, context) {
        assertValidateChangeArgs(args);
        await requireLifecyclePermission(context, "specops_validate_change");
        context.metadata({ title: "Validating OpenSpec change…" });
        const result = await validateChange(args.change, {
            validateChange: change => validateOpenSpecChange(change, context.directory),
        });
        return JSON.stringify(result);
    },
});

function assertChangeName(change: string): void {
    if (typeof change !== "string" || !change.trim()) {
        throw new Error("An OpenSpec change name is required.");
    }
}

function assertValidateChangeArgs(args: unknown): asserts args is { change: string } {
    if (
        !args ||
        typeof args !== "object" ||
        Array.isArray(args) ||
        Object.keys(args).length !== 1 ||
        !("change" in args) ||
        typeof args.change !== "string" ||
        !args.change.trim()
    ) {
        throw new Error("specops_validate_change expects exactly {change: string}");
    }
}

function formatIssues(issues: ChangeValidation["issues"]): string {
    return (
        issues.map(issue => `${issue.path}: ${issue.message}`).join("; ") ||
        "OpenSpec reported a validation violation"
    );
}
