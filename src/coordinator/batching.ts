/**
 * Batch scheduler for graph-derived planning dispatch.
 *
 * This module owns the planning-batch output vocabulary and scheduling
 * helpers used by the coordinator to dispatch specialist subagents
 * concurrently. Its exports are `SpecialistPass`, `PlanningRoute`,
 * `nextBatch()`, `feasiblePlanningArtifacts()`, and `ownerRoleIdFor()`.
 */
import type { NormalizedArtifact, NormalizedStatus } from "../openspec/status.js";
import { AGENT_IDS, ROLE_WORKFLOW_ORDER, type AgentId } from "../agents/ids.js";
import { requiredClosure, transitiveRequires, type ArtifactsById } from "./artifact-graph.js";
import {
    collectUnknownRequired,
    derivePlanningCompletion,
    satisfiedArtifactIds,
} from "./planning-completion.js";

/** Specialist pass selected for a planning artifact. */
export type SpecialistPass = "designer" | "planner-generic";

/** The next planning action derived from an OpenSpec artifact graph. */
export type PlanningRoute =
    | {
          kind: "author";
          artifactId: string;
          outputPath: string;
          specialist: SpecialistPass;
      }
    | { kind: "plan-ready" }
    | { kind: "blocked"; reason: string; unknownRequired?: readonly string[] };

/**
 * Select the next planning batch from one normalized OpenSpec status snapshot.
 *
 * Planning completion follows the canonical `derivePlanningCompletion`
 * verdict, so the scheduler's plan-ready and blocked routes can never
 * disagree with status or Todo projections of the same state. Feasibility is
 * derived from the full required closure, while selection uses
 * reverse-dependency reachability and deterministic workflow ordering. The
 * calculation is pure: it does not mutate the supplied status or retain state
 * between calls.
 *
 * @param status Normalized OpenSpec artifact and dependency state.
 * @param maxConcurrency Maximum number of author routes to return.
 * @returns Author routes, a plan-ready route, or one blocked route.
 */
export function nextBatch(status: NormalizedStatus, maxConcurrency: number): PlanningRoute[] {
    const completion = derivePlanningCompletion(status);
    if (completion.complete) {
        return [{ kind: "plan-ready" }];
    }

    if (completion.reason === "unknown-required") {
        return [
            {
                kind: "blocked",
                reason: `Unknown required artifact id(s): ${completion.unknownRequired.join(", ")}`,
                unknownRequired: completion.unknownRequired,
            },
        ];
    }

    if (completion.reason === "flag-false") {
        return [{ kind: "blocked", reason: "isPlanningComplete false with closure satisfied" }];
    }

    const artifactsById = new Map(status.artifacts.map(artifact => [artifact.id, artifact]));
    const closure = requiredClosure(status.applyRequires, artifactsById);
    const satisfied = satisfiedArtifactIds(status);
    const feasible = status.artifacts.filter(artifact =>
        isAuthorEligible(artifact, closure, satisfied, artifactsById),
    );

    if (feasible.length > 0) {
        const remaining = [...feasible].sort(compareSchemaOrder);
        const selected: NormalizedArtifact[] = [];
        const limit = Math.min(maxConcurrency, remaining.length);
        while (selected.length < limit) {
            const next = selectMostUnblocking(remaining, closure, satisfied, artifactsById);
            selected.push(next);
            remaining.splice(
                remaining.findIndex(artifact => artifact.id === next.id),
                1,
            );
        }
        return selected.map(toAuthorRoute);
    }

    return [
        {
            kind: "blocked",
            reason: "No feasible artifact in the applyRequires dependency closure",
        },
    ];
}

/**
 * List the planning artifacts eligible for authoring from one durable snapshot.
 *
 * Eligibility is the scheduler's authoring rule: an artifact sits in the
 * `applyRequires` closure, remains unsatisfied, and has every transitive
 * requirement satisfied. Any dependency edge referencing an unknown artifact
 * id fails the whole derivation closed with an empty list, matching the
 * scheduler's blocked route. The result is sorted deterministically by
 * workflow role and then artifact id; the order is stable output, not a
 * recommendation.
 *
 * @param status Normalized OpenSpec artifact and dependency state.
 * @returns Eligible artifacts in deterministic order, empty when planning is blocked.
 */
export function feasiblePlanningArtifacts(status: NormalizedStatus): readonly NormalizedArtifact[] {
    const artifactsById = new Map(status.artifacts.map(artifact => [artifact.id, artifact]));
    if (collectUnknownRequired(status, artifactsById).length > 0) return [];

    const closure = requiredClosure(status.applyRequires, artifactsById);
    const satisfied = satisfiedArtifactIds(status);
    return status.artifacts
        .filter(artifact => isAuthorEligible(artifact, closure, satisfied, artifactsById))
        .sort(compareSchemaOrder);
}

/**
 * Check whether one artifact is eligible for authoring right now.
 *
 * This predicate is the single source of planning-action legality: the
 * artifact must sit in the required closure, remain unsatisfied, and have
 * every transitive requirement satisfied. Both the batch scheduler and the
 * eligible-action projection derive from it so they can never disagree.
 *
 * @param artifact Artifact whose authoring eligibility is being tested.
 * @param closure Artifact ids in the required planning closure.
 * @param satisfied Artifact ids already completed or skipped.
 * @param artifactsById Artifact lookup used for reachability checks.
 * @returns Whether the artifact can be authored now.
 */
function isAuthorEligible(
    artifact: NormalizedArtifact,
    closure: ReadonlySet<string>,
    satisfied: ReadonlySet<string>,
    artifactsById: ArtifactsById,
): boolean {
    return (
        closure.has(artifact.id) &&
        !satisfied.has(artifact.id) &&
        [...requiredClosure([artifact.id], artifactsById)].every(
            requiredId => requiredId === artifact.id || satisfied.has(requiredId),
        )
    );
}

/**
 * Select the feasible artifact that unblocks the most unsatisfied closure
 * members.
 *
 * The input is already schema-sorted, so retaining the first candidate on a
 * score tie preserves the deterministic schema-order tie-breaker.
 *
 * @param feasible Candidate artifacts eligible for this batch.
 * @param closure Artifact ids in the required planning closure.
 * @param satisfied Artifact ids already completed or skipped.
 * @param artifactsById Artifact lookup used for reachability checks.
 * @returns The highest-scoring candidate, or the first candidate when tied.
 */
function selectMostUnblocking(
    feasible: readonly NormalizedArtifact[],
    closure: ReadonlySet<string>,
    satisfied: ReadonlySet<string>,
    artifactsById: ArtifactsById,
): NormalizedArtifact {
    let selected = feasible[0];
    let selectedScore = -1;
    for (const candidate of feasible) {
        const score = [...closure].filter(
            artifactId =>
                !satisfied.has(artifactId) &&
                artifactId !== candidate.id &&
                transitiveRequires(artifactId, candidate.id, artifactsById),
        ).length;
        if (score > selectedScore) {
            selected = candidate;
            selectedScore = score;
        }
    }
    return selected;
}

/**
 * Compare artifacts by workflow role and then id for deterministic ordering.
 *
 * @param left First artifact to compare.
 * @param right Second artifact to compare.
 * @returns A negative, zero, or positive ordering value.
 */
function compareSchemaOrder(left: NormalizedArtifact, right: NormalizedArtifact): number {
    const leftRole = workflowRoleOrder(left);
    const rightRole = workflowRoleOrder(right);
    if (leftRole !== rightRole) return leftRole - rightRole;
    if (left.id < right.id) return -1;
    if (left.id > right.id) return 1;
    return 0;
}

/**
 * Resolve an artifact's owner to its position in the configured workflow.
 *
 * @param artifact Artifact whose conventional specialist owner is needed.
 * @returns The owning role's schema-order index.
 */
function workflowRoleOrder(artifact: NormalizedArtifact): number {
    return ROLE_WORKFLOW_ORDER.indexOf(ownerRoleIdFor(artifact));
}

/**
 * Convert a normalized artifact into the scheduler's author-route vocabulary.
 *
 * @param artifact Feasible artifact selected for dispatch.
 * @returns An author route carrying the artifact's id, path, and specialist.
 */
function toAuthorRoute(artifact: NormalizedArtifact): PlanningRoute {
    return {
        kind: "author",
        artifactId: artifact.id,
        outputPath: artifact.outputPath,
        specialist: specialistFor(artifact),
    };
}

/** Return the specialist pass mapped to one artifact id. */
function specialistFor(artifact: NormalizedArtifact): SpecialistPass {
    return artifact.id === "design" ? "designer" : "planner-generic";
}

/**
 * Return the deterministic owning role id for one artifact's authoring pass.
 *
 * Ownership follows the existing dispatch rule: design work belongs to the
 * designer role and every other artifact to the planner role. The projection
 * exposes this only because it is already deterministic in SpecOps.
 *
 * @param artifact Artifact whose conventional specialist owner is needed.
 * @returns The owning role's stable agent id.
 */
export function ownerRoleIdFor(artifact: NormalizedArtifact): AgentId {
    return specialistFor(artifact) === "designer" ? AGENT_IDS.designer : AGENT_IDS.planner;
}
