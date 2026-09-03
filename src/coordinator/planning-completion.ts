/**
 * Canonical deterministic planning-completion derivation.
 *
 * Consumes only the normalized OpenSpec facts already trusted by SpecOps and
 * projects them onto one completion verdict: unknown dependency edges, an
 * unsatisfied `applyRequires` closure, or an explicit
 * `isPlanningComplete: false` flag each fail closed with a stable reason.
 * The derivation is pure — no I/O, no timestamps, no inferred state — and is
 * the single authority for "is planning complete?": the planning scheduler,
 * the status lifecycle projection, and the Todo projection all consume it, so
 * they cannot disagree about the same durable state.
 *
 * Exports: `PlanningCompletion`, `derivePlanningCompletion`,
 * `satisfiedArtifactIds`, `collectUnknownRequired`.
 */
import type { NormalizedArtifact, NormalizedStatus } from "../openspec/status.js";
import { requiredClosure } from "./artifact-graph.js";

/**
 * One planning-completion verdict for one durable snapshot.
 *
 * `flag-false` is reported only when the required closure is satisfied but
 * OpenSpec explicitly reports `isPlanningComplete: false`; `closure-unsatisfied`
 * covers every state where a closure member is neither done nor skipped.
 */
export type PlanningCompletion =
    | { complete: true }
    | { complete: false; reason: "unknown-required"; unknownRequired: readonly string[] }
    | { complete: false; reason: "closure-unsatisfied" }
    | { complete: false; reason: "flag-false" };

/** Build the set of satisfied artifact ids (status done or skipped). */
export function satisfiedArtifactIds(status: NormalizedStatus): Set<string> {
    return new Set(
        status.artifacts
            .filter(artifact => artifact.status === "done" || artifact.status === "skipped")
            .map(artifact => artifact.id),
    );
}

/**
 * Collect artifact ids referenced by `applyRequires` or artifact `requires`
 * edges that do not exist in the normalized graph.
 *
 * Unknown dependencies fail the derivation closed so consumers never fabricate
 * an artifact to satisfy an incomplete graph.
 *
 * @param status Normalized status containing the dependency references.
 * @param artifactsById Artifact lookup used to identify unknown references.
 * @returns Unknown ids in first-seen order without duplicates.
 */
export function collectUnknownRequired(
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
 * Derive the canonical planning-completion verdict from one durable snapshot.
 *
 * The verdict follows the rule the planning scheduler has always applied:
 * planning is complete when no dependency edge references an unknown artifact,
 * every member of the `applyRequires` closure is done or skipped, and OpenSpec
 * does not report `isPlanningComplete: false`. Reasons are evaluated in that
 * order so `flag-false` always implies a satisfied closure.
 *
 * @param status Normalized OpenSpec artifact and dependency state.
 * @returns One completion verdict with a stable reason when incomplete.
 */
export function derivePlanningCompletion(status: NormalizedStatus): PlanningCompletion {
    const artifactsById = new Map(status.artifacts.map(artifact => [artifact.id, artifact]));
    const unknownRequired = collectUnknownRequired(status, artifactsById);
    if (unknownRequired.length > 0) {
        return { complete: false, reason: "unknown-required", unknownRequired };
    }

    const closure = requiredClosure(status.applyRequires, artifactsById);
    const satisfied = satisfiedArtifactIds(status);
    if (![...closure].every(artifactId => satisfied.has(artifactId))) {
        return { complete: false, reason: "closure-unsatisfied" };
    }

    if (status.isPlanningComplete === false) {
        return { complete: false, reason: "flag-false" };
    }

    return { complete: true };
}
