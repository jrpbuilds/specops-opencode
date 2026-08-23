/**
 * Batch scheduler for graph-derived planning dispatch.
 *
 * This module owns the planning-batch output vocabulary and scheduling
 * helpers used by the coordinator to dispatch specialist subagents
 * concurrently. Its exports are `SpecialistPass`, `PlanningRoute`, and
 * `nextBatch()`.
 */
import type { NormalizedArtifact, NormalizedStatus } from "../openspec/status.js";
import { AGENT_IDS, ROLE_WORKFLOW_ORDER } from "../agents/ids.js";
import { requiredClosure, transitiveRequires, type ArtifactsById } from "./artifact-graph.js";

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
 * Feasibility is derived from the full required closure, while selection uses
 * reverse-dependency reachability and deterministic workflow ordering. The
 * calculation is pure: it does not mutate the supplied status or retain state
 * between calls.
 *
 * @param status Normalized OpenSpec artifact and dependency state.
 * @param maxConcurrency Maximum number of author routes to return.
 * @returns Author routes, a plan-ready route, or one blocked route.
 */
export function nextBatch(status: NormalizedStatus, maxConcurrency: number): PlanningRoute[] {
    const artifactsById = new Map(status.artifacts.map(artifact => [artifact.id, artifact]));
    const unknownRequired = collectUnknownRequired(status, artifactsById);
    if (unknownRequired.length > 0) {
        return [
            {
                kind: "blocked",
                reason: `Unknown required artifact id(s): ${unknownRequired.join(", ")}`,
                unknownRequired,
            },
        ];
    }

    const closure = requiredClosure(status.applyRequires, artifactsById);
    const satisfied = new Set(
        status.artifacts
            .filter(artifact => artifact.status === "done" || artifact.status === "skipped")
            .map(artifact => artifact.id),
    );
    const feasible = status.artifacts.filter(
        artifact =>
            closure.has(artifact.id) &&
            !satisfied.has(artifact.id) &&
            [...requiredClosure([artifact.id], artifactsById)].every(
                requiredId => requiredId === artifact.id || satisfied.has(requiredId),
            ),
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

    const closureSatisfied = [...closure].every(artifactId => satisfied.has(artifactId));
    if (closureSatisfied && status.isPlanningComplete !== false) {
        return [{ kind: "plan-ready" }];
    }

    if (closureSatisfied && status.isPlanningComplete === false) {
        return [{ kind: "blocked", reason: "isPlanningComplete false with closure satisfied" }];
    }

    return [
        {
            kind: "blocked",
            reason: "No feasible artifact in the applyRequires dependency closure",
        },
    ];
}

/**
 * Collect artifact ids referenced by `applyRequires` or artifact `requires`
 * edges that do not exist in the normalized graph.
 *
 * Unknown dependencies become a blocked route so the scheduler never
 * fabricates an artifact to satisfy an incomplete graph.
 *
 * @param status Normalized status containing the dependency references.
 * @param artifactsById Artifact lookup used to identify unknown references.
 * @returns Unknown ids in first-seen order without duplicates.
 */
function collectUnknownRequired(
    status: NormalizedStatus,
    artifactsById: ReadonlyMap<string, NormalizedArtifact>,
): string[] {
    const unknown = new Set<string>();
    for (const requiredId of status.applyRequires) {
        if (!artifactsById.has(requiredId)) unknown.add(requiredId);
    }
    for (const artifact of status.artifacts) {
        for (const requiredId of artifact.requires) {
            if (!artifactsById.has(requiredId)) unknown.add(requiredId);
        }
    }
    return [...unknown];
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
    const role = specialistFor(artifact) === "designer" ? AGENT_IDS.designer : AGENT_IDS.planner;
    return ROLE_WORKFLOW_ORDER.indexOf(role);
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
