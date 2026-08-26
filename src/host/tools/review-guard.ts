import { tool } from "@opencode-ai/plugin/tool";
import {
    captureBaseline,
    resolveRepoRoot,
    verifyBaseline,
    type CaptureResult,
    type GuardResult,
} from "../../coordinator/review-guard.js";
import { runCaptureStdout } from "../../helpers.js";
import { requireLifecyclePermission } from "../lifecycle-permission.js";

/** Valid operation names for the review guard tool. */
type ReviewGuardOperation = "capture" | "verify";

/** Enforce the tool's exact `{ operation, change }` argument contract. */
function assertReviewGuardArgs(args: unknown): asserts args is {
    operation: ReviewGuardOperation;
    change: string;
} {
    if (
        !args ||
        typeof args !== "object" ||
        Array.isArray(args) ||
        Object.keys(args).length !== 2 ||
        !("operation" in args) ||
        (args.operation !== "capture" && args.operation !== "verify") ||
        !("change" in args) ||
        typeof args.change !== "string" ||
        !args.change.trim()
    ) {
        throw new Error(
            'specops_review_guard expects exactly {operation: "capture" | "verify", change: string}',
        );
    }
}

/**
 * Expose the review worktree-mutation guard to coordinator agents.
 *
 * The coordinator captures a protected-state baseline before the review critic
 * fan-out and verifies it after each review phase fan-in. Review agents are
 * denied `specops_*` and `specops_lifecycle`, so only the coordinator can
 * invoke this tool; it rides the existing lifecycle boundary without any
 * permission-policy change.
 */
export const reviewGuardTool = tool({
    description:
        "Capture or verify the review worktree-mutation guard for a named change: snapshot " +
        "protected state before review fan-out and verify no protected state changed after fan-in.",
    args: {
        operation: tool.schema.string(),
        change: tool.schema.string(),
    },
    async execute(args, context) {
        assertReviewGuardArgs(args);
        await requireLifecyclePermission(context, "specops_review_guard");
        context.metadata({
            title:
                args.operation === "capture"
                    ? "Capturing review guard baseline…"
                    : "Verifying review guard baseline…",
        });
        const deps = { capture: runCaptureStdout };
        const root = await resolveRepoRoot(context.directory, deps.capture);
        const result: CaptureResult | GuardResult =
            args.operation === "capture"
                ? await captureBaseline(args.change, root, deps)
                : await verifyBaseline(args.change, root, deps);
        return JSON.stringify(result);
    },
});
