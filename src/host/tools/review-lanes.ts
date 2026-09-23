import { tool } from "@opencode-ai/plugin/tool";
import { getProcessConfig } from "../config-snapshot.js";
import {
    clearReviewLaneRound,
    getReviewLaneRound,
    retryReviewLane,
    startReviewLaneRound,
} from "../review-lanes.js";
import { requireLifecyclePermission } from "../lifecycle-permission.js";
import { getSessionBinding, recordSessionBinding } from "../session-bindings.js";

type ReviewLaneOperation = "start" | "status" | "reset" | "retry";

type ReviewLaneToolArgs = {
    operation: ReviewLaneOperation;
    change: string;
    lanes?: unknown;
    roundId?: string;
    laneId?: string;
};

/**
 * Validate operation-specific fields before permission or session side effects.
 *
 * @param args Unknown plugin-tool input.
 * @throws When the operation, change, or operation-specific fields are invalid.
 */
function assertReviewLaneToolArgs(args: unknown): asserts args is ReviewLaneToolArgs {
    if (
        !args ||
        typeof args !== "object" ||
        Array.isArray(args) ||
        !("operation" in args) ||
        !["start", "status", "reset", "retry"].includes(String(args.operation)) ||
        !("change" in args) ||
        typeof args.change !== "string" ||
        !args.change.trim()
    ) {
        throw new Error(
            'specops_review_lanes expects {operation: "start" | "status" | "reset" | "retry", change: string, ...}',
        );
    }

    const value = args as Record<string, unknown>;
    const allowed = new Set(["operation", "change", "lanes", "roundId", "laneId"]);
    const extra = Object.keys(value).filter(key => !allowed.has(key));
    if (extra.length > 0) {
        throw new Error(`specops_review_lanes received unsupported field(s): ${extra.join(", ")}`);
    }

    if (value.operation === "start") {
        if (
            value.lanes === undefined ||
            value.roundId !== undefined ||
            value.laneId !== undefined
        ) {
            throw new Error("specops_review_lanes start expects {operation, change, lanes}");
        }
    } else if (value.operation === "status" || value.operation === "reset") {
        if (
            typeof value.roundId !== "string" ||
            !value.roundId.trim() ||
            value.lanes !== undefined ||
            value.laneId !== undefined
        ) {
            throw new Error(
                `specops_review_lanes ${value.operation} expects {operation, change, roundId}`,
            );
        }
    } else if (
        typeof value.roundId !== "string" ||
        !value.roundId.trim() ||
        typeof value.laneId !== "string" ||
        !value.laneId.trim() ||
        value.lanes !== undefined
    ) {
        throw new Error("specops_review_lanes retry expects {operation, change, roundId, laneId}");
    }
}

/**
 * Expose Orchestrator-selected review rounds through the lifecycle tool surface.
 *
 * The tool validates and tracks the supplied plan, execution state, and
 * configured capacity; it never chooses lanes or their scopes.
 */
export const reviewLanesTool = tool({
    description:
        "Register and inspect an Orchestrator-selected review-lane round, or reset/retry its runtime state. The runtime validates and tracks lanes but never chooses them.",
    args: {
        operation: tool.schema.string(),
        change: tool.schema.string(),
        lanes: tool.schema
            .array(
                tool.schema
                    .object({
                        id: tool.schema.string(),
                        lens: tool.schema.string(),
                        scope: tool.schema.string(),
                        capabilityHints: tool.schema.array(tool.schema.string()).optional(),
                    })
                    .strict(),
            )
            .optional(),
        roundId: tool.schema.string().optional(),
        laneId: tool.schema.string().optional(),
    },
    /**
     * Execute one lane-round operation after authorization and active-change checks.
     *
     * @param args Validated operation and its lane/round identity fields.
     * @param context OpenCode tool context for permission and session binding.
     * @returns JSON snapshot or reset result for the requested operation.
     * @throws When authorization, active binding, round identity, or lane state is invalid.
     */
    async execute(args, context) {
        assertReviewLaneToolArgs(args);
        await requireLifecyclePermission(context, "specops_review_lanes");
        const change = args.change.trim();
        const binding = getSessionBinding(context.sessionID);
        if (binding && binding.change !== change) {
            throw new Error(
                `specops_review_lanes change '${change}' does not match the active session change '${binding.change}'`,
            );
        }
        recordSessionBinding(context.sessionID, context.agent, args.change);
        const config = getProcessConfig();
        context.metadata({ title: `${args.operation} review lanes…` });

        let result: unknown;
        if (args.operation === "start") {
            result = withCapacity(
                startReviewLaneRound(context.sessionID, args.change, args.lanes),
                config.maxSubagentConcurrency,
            );
        } else if (args.operation === "status") {
            const snapshot = getReviewLaneRound(context.sessionID, args.change);
            if (!snapshot || snapshot.roundId !== args.roundId) {
                throw new Error(`Stale or missing review round '${args.roundId}'`);
            }
            result = withCapacity(snapshot, config.maxSubagentConcurrency);
        } else if (args.operation === "reset") {
            clearReviewLaneRound(context.sessionID, args.roundId!);
            result = { active: false, change: args.change, cleared: true };
        } else {
            retryReviewLane(context.sessionID, args.roundId!, args.laneId!);
            const snapshot = getReviewLaneRound(context.sessionID, args.change);
            if (!snapshot || snapshot.roundId !== args.roundId) {
                throw new Error(`Stale or missing review round '${args.roundId}'`);
            }
            result = withCapacity(snapshot, config.maxSubagentConcurrency);
        }

        return JSON.stringify(result, null, 2);
    },
});

/** Add configured concurrency facts to a current lane-round snapshot.
 *
 * @param snapshot Current runtime-owned lane state.
 * @param maxConcurrency Maximum concurrent review lanes from process config.
 * @returns A snapshot augmented with the ceiling and free capacity.
 */
function withCapacity(
    snapshot: NonNullable<ReturnType<typeof getReviewLaneRound>>,
    maxConcurrency: number,
) {
    const active = snapshot.counts.inFlight;
    return {
        ...snapshot,
        maxConcurrency,
        availableCapacity: Math.max(0, maxConcurrency - active),
    };
}
