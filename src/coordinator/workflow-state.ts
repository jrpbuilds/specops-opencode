/**
 * Canonical deterministic derivation of workflow phase, lifecycle legality,
 * and eligible actions.
 *
 * Consumes only the normalized OpenSpec facts already trusted by SpecOps —
 * `NormalizedStatus` from `openspec status` and the normalized apply-instruction
 * context from `openspec instructions apply` — and projects them onto one
 * workflow phase, per-capability legality, and the mechanically legal actions.
 * The projection is pure: no I/O, no timestamps, no inferred state; identical
 * durable state yields identical results. `allowed: true` and a listed
 * eligible action mean an action is legal now, never that it is recommended;
 * choosing among legal actions remains coordinator judgement.
 *
 * Exports: `WorkflowPhase`, `LifecycleBlockReason`, `LifecycleCapability`,
 * `LifecycleCapabilities`, `WorkflowState`, `EligibleAction`,
 * `deriveWorkflowState`, `deriveEligibleActions`.
 */
import type { AgentId } from "../agents/ids.js";
import type { NormalizedApplyInstructionContext } from "../openspec/apply-instructions.js";
import type { NormalizedStatus } from "../openspec/status.js";
import { feasiblePlanningArtifacts, ownerRoleIdFor } from "./batching.js";
import { derivePlanningCompletion } from "./planning-completion.js";

/** Deterministic workflow phase derived from durable OpenSpec state. */
export type WorkflowPhase = "planning" | "implementation" | "review";

/**
 * Stable machine-readable reason one lifecycle capability is unavailable.
 *
 * - `planning-incomplete`: the required planning closure is unsatisfied or
 *   OpenSpec reports `isPlanningComplete: false`.
 * - `planning-blocked`: dependency edges reference artifact ids absent from
 *   the normalized graph.
 * - `apply-blocked`: planning is complete but OpenSpec reports the apply flow
 *   as blocked, so the durable task state is unusable.
 * - `implementation-incomplete`: tracked tasks remain unchecked.
 */
export type LifecycleBlockReason =
    "planning-incomplete" | "planning-blocked" | "apply-blocked" | "implementation-incomplete";

/** One lifecycle capability: a legal-now fact, never a recommendation. */
export type LifecycleCapability =
    { allowed: true } | { allowed: false; reason: LifecycleBlockReason };

/** Lifecycle capabilities derived for one durable snapshot. */
export type LifecycleCapabilities = {
    implement: LifecycleCapability;
    review: LifecycleCapability;
};

/** Workflow phase and lifecycle legality projected from one durable snapshot. */
export type WorkflowState = {
    phase: WorkflowPhase;
    lifecycle: LifecycleCapabilities;
};

/**
 * One mechanically legal workflow action for the current durable state.
 *
 * Author actions are derived from the normalized OpenSpec artifact graph, so
 * custom schemas, skipped artifacts, and reordered schemas stay supported,
 * and each carries the artifact's deterministic owning role. Implementation
 * and review actions mirror the lifecycle legality of `deriveWorkflowState`
 * exactly; remediation is the review-phase form of legal implementation work.
 *
 * Archive is deliberately never emitted. SpecOps keeps no durable record of
 * review success, so archive legality is not objectively derivable from
 * current state; OpenSpec structural readiness alone must not stand in for a
 * passed review. Adding an archive action requires a canonical legality
 * source first; until then the passed-review-before-archive invariant stays
 * coordinator-owned prompt guidance.
 */
export type EligibleAction =
    | { type: "author-artifact"; artifactId: string; role: AgentId }
    | { type: "enter-implementation" }
    | { type: "remediate" }
    | { type: "enter-review" };

/** Build the stable blocked capability for one unavailable lifecycle action. */
function blocked(reason: LifecycleBlockReason): LifecycleCapability {
    return { allowed: false, reason };
}

/** Build the stable allowed capability, which carries no reason by design. */
function allowed(): LifecycleCapability {
    return { allowed: true };
}

/**
 * Derive the workflow phase and lifecycle legality from one durable snapshot.
 *
 * Planning completion comes from the canonical `derivePlanningCompletion`
 * predicate, shared with the planning scheduler and Todo projection, so these
 * projections can never disagree with either surface about the same durable
 * state. When planning is complete but OpenSpec reports the apply flow as
 * blocked, the durable task state is unusable and both capabilities fail
 * closed. A schema with no task tracking never reports `all_done`; with
 * nothing tracked outstanding, review is legal as soon as planning is
 * complete. Implementation stays legal during review because remediation
 * dispatches remain legal after a failed review.
 *
 * @param status Normalized `openspec status` facts for the change.
 * @param apply Normalized `openspec instructions apply` facts for the change.
 * @returns The phase and implement/review lifecycle legality.
 */
export function deriveWorkflowState(
    status: NormalizedStatus,
    apply: NormalizedApplyInstructionContext,
): WorkflowState {
    const completion = derivePlanningCompletion(status);
    if (!completion.complete) {
        const reason =
            completion.reason === "unknown-required" ? "planning-blocked" : "planning-incomplete";
        return {
            phase: "planning",
            lifecycle: {
                implement: blocked(reason),
                review: blocked(reason),
            },
        };
    }

    if (apply.state === "blocked") {
        return {
            phase: "planning",
            lifecycle: { implement: blocked("apply-blocked"), review: blocked("apply-blocked") },
        };
    }

    const allDone = apply.state === "all_done";
    const untracked =
        apply.state === "ready" && apply.progress.total === 0 && apply.tasks.length === 0;
    return {
        phase: allDone ? "review" : "implementation",
        lifecycle: {
            implement: allowed(),
            review: allDone || untracked ? allowed() : blocked("implementation-incomplete"),
        },
    };
}

/**
 * Derive the mechanically legal workflow actions from one durable snapshot.
 *
 * Author actions reuse the planning scheduler's feasibility derivation, so
 * they always agree with what the coordinator could dispatch, and they never
 * appear alongside implementation or review actions: a feasible artifact
 * means the planning closure is unsatisfied, which blocks both capabilities.
 * The implementation action is legal whenever implementation work is, taking
 * the remediation form while the change sits in the review phase, and the
 * review action mirrors the review capability exactly.
 *
 * The result is ordered deterministically for stable output and tests —
 * author actions in schema order, then the implementation-family action, then
 * review — but the order is not a recommendation; when several actions are
 * legal, choosing among them is coordinator judgement.
 *
 * @param status Normalized `openspec status` facts for the change.
 * @param apply Normalized `openspec instructions apply` facts for the change.
 * @returns Every currently legal action, in stable non-prescriptive order.
 */
export function deriveEligibleActions(
    status: NormalizedStatus,
    apply: NormalizedApplyInstructionContext,
): EligibleAction[] {
    const { phase, lifecycle } = deriveWorkflowState(status, apply);
    const actions: EligibleAction[] = feasiblePlanningArtifacts(status).map(artifact => ({
        type: "author-artifact",
        artifactId: artifact.id,
        role: ownerRoleIdFor(artifact),
    }));

    if (lifecycle.implement.allowed) {
        actions.push(phase === "review" ? { type: "remediate" } : { type: "enter-implementation" });
    }
    if (lifecycle.review.allowed) {
        actions.push({ type: "enter-review" });
    }
    return actions;
}
