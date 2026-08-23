import { tool } from "@opencode-ai/plugin/tool";
import { validateChange as runOpenSpecValidation } from "../../openspec/validate.js";
import { validateChange } from "../../tools/validate-change.js";
import { requireLifecyclePermission } from "../lifecycle-permission.js";

/** Enforce the tool's exact `{ change }` argument contract. */
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

/** Expose the scoped validation gate to coordinator agents. */
export const validateChangeTool = tool({
    description: "Validate one active OpenSpec change with strict, change-scoped validation.",
    args: {
        change: tool.schema.string(),
    },
    async execute(args, context) {
        assertValidateChangeArgs(args);
        await requireLifecyclePermission(context, "specops_validate_change");
        context.metadata({ title: "Validating OpenSpec change…" });
        const result = await validateChange(args.change, {
            validateChange: change => runOpenSpecValidation(change, context.directory),
        });
        return JSON.stringify(result);
    },
});
