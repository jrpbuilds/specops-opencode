/**
 * Canonical deterministic derivation of workflow phase and lifecycle legality.
 *
 * Consumes only the normalized OpenSpec facts already trusted by SpecOps —
 * `NormalizedStatus` from `openspec status` and the normalized apply-instruction
 * context from `openspec instructions apply` — and projects them onto one
 * workflow phase plus per-capability legality. The projection is pure: no I/O,
 * no timestamps, no inferred state; identical durable state yields identical
 * results. `allowed: true` means an action is legal now, never that it is
 * recommended; choosing among legal actions remains coordinator judgement.
 *
 * Exports: `WorkflowPhase`, `LifecycleBlockReason`, `LifecycleCapability`,
 * `LifecycleCapabilities`, `WorkflowState`, `deriveWorkflowState`.
 */
import type { NormalizedApplyInstructionContext } from "../openspec/apply-instructions.js";
import type { NormalizedArtifact, NormalizedStatus } from "../openspec/status.js";
import { requiredClosure } from "./artifact-graph.js";
import { collectUnknownRequired } from "./batching.js";

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

/** An artifact satisfies the planning closure when OpenSpec marks it done or skipped. */
function isSatisfied(artifact: NormalizedArtifact): boolean {
    return artifact.status === "done" || artifact.status === "skipped";
}

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
 * Planning authority follows the same rule as the planning scheduler: the
 * required closure is satisfied, no dependency edge references an unknown
 * artifact, and OpenSpec does not report `isPlanningComplete: false`. When
 * planning is complete but OpenSpec reports the apply flow as blocked, the
 * durable task state is unusable and both capabilities fail closed. A schema
 * with no task tracking never reports `all_done`; with nothing tracked
 * outstanding, review is legal as soon as planning is complete. Implementation
 * stays legal during review because remediation dispatches remain legal after
 * a failed review.
 *
 * @param status Normalized `openspec status` facts for the change.
 * @param apply Normalized `openspec instructions apply` facts for the change.
 * @returns The phase and implement/review lifecycle legality.
 */
export function deriveWorkflowState(
    status: NormalizedStatus,
    apply: NormalizedApplyInstructionContext,
): WorkflowState {
    const artifactsById = new Map(status.artifacts.map(artifact => [artifact.id, artifact]));
    if (collectUnknownRequired(status, artifactsById).length > 0) {
        return {
            phase: "planning",
            lifecycle: {
                implement: blocked("planning-blocked"),
                review: blocked("planning-blocked"),
            },
        };
    }

    const closure = requiredClosure(status.applyRequires, artifactsById);
    const satisfied = new Set(status.artifacts.filter(isSatisfied).map(artifact => artifact.id));
    const closureSatisfied = [...closure].every(artifactId => satisfied.has(artifactId));
    if (!closureSatisfied || status.isPlanningComplete === false) {
        return {
            phase: "planning",
            lifecycle: {
                implement: blocked("planning-incomplete"),
                review: blocked("planning-incomplete"),
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
