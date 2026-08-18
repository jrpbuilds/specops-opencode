import type { NormalizedArtifact, NormalizedStatus } from "./status.js";

/** Specialist pass selected for a planning artifact. */
export type SpecialistPass =
    "designer" | "planner-generic";

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
 * Select the next planning action from one normalized OpenSpec status snapshot.
 *
 * This is a reference implementation for the coordinator prompt. It is pure
 * by design: routing is still performed by the coordinator at runtime.
 */
export function nextPlanningRoute(status: NormalizedStatus): PlanningRoute {
    const artifactsById = new Map(status.artifacts.map(artifact => [artifact.id, artifact]));
    const unknownRequired = collectUnknownRequired(status, artifactsById);
    if (unknownRequired.length > 0) {
        return {
            kind: "blocked",
            reason: `Unknown required artifact id(s): ${unknownRequired.join(", ")}`,
            unknownRequired,
        };
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
            artifact.requires.every(requiredId => satisfied.has(requiredId)),
    );

    if (feasible.length > 0) {
        const selected = selectMostUnblocking(feasible, closure, satisfied, artifactsById);
        return {
            kind: "author",
            artifactId: selected.id,
            outputPath: selected.outputPath,
            specialist: specialistFor(selected),
        };
    }

    const closureSatisfied = [...closure].every(artifactId => satisfied.has(artifactId));
    if (closureSatisfied && status.isPlanningComplete !== false) {
        return { kind: "plan-ready" };
    }

    if (closureSatisfied && status.isPlanningComplete === false) {
        return { kind: "blocked", reason: "isPlanningComplete false with closure satisfied" };
    }

    return {
        kind: "blocked",
        reason: "No feasible artifact in the applyRequires dependency closure",
    };
}

/**
 * Collect artifact ids referenced by `applyRequires` or any artifact's
 * `requires` that do not exist in the artifact graph.
 *
 * Surfaced as a "blocked" route reason so the coordinator never fabricates an
 * artifact to satisfy an unknown dependency.
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
 * Compute the transitive closure of artifact ids that must be satisfied for
 * `applyRequires` to complete.
 *
 * Iterative depth-first walk over each artifact's `requires` edges; the
 * closure is what `nextPlanningRoute` treats as in-scope for feasibility.
 */
function requiredClosure(
    applyRequires: readonly string[],
    artifactsById: ReadonlyMap<string, NormalizedArtifact>,
): Set<string> {
    const closure = new Set(applyRequires);
    const pending = [...applyRequires];
    while (pending.length > 0) {
        const artifact = artifactsById.get(pending.pop()!);
        if (!artifact) continue;
        for (const requiredId of artifact.requires) {
            if (!closure.has(requiredId)) {
                closure.add(requiredId);
                pending.push(requiredId);
            }
        }
    }
    return closure;
}

/**
 * Pick the feasible artifact that transitively unblocks the most other
 * unsatisfied closure members.
 *
 * Deterministic tie-breaker so routing prefers artifacts that unlock
 * downstream work over equally-feasible but leaf-shaped artifacts.
 */
function selectMostUnblocking(
    feasible: readonly NormalizedArtifact[],
    closure: ReadonlySet<string>,
    satisfied: ReadonlySet<string>,
    artifactsById: ReadonlyMap<string, NormalizedArtifact>,
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
 * Reachability check: does `artifactId` transitively require `targetId`
 * through the `requires` graph?
 *
 * The `visited` set guards against cycles (a schema could declare
 * mutually-requiring artifacts); cyclic paths return false to terminate
 * the recursion safely.
 */
function transitiveRequires(
    artifactId: string,
    targetId: string,
    artifactsById: ReadonlyMap<string, NormalizedArtifact>,
    visited = new Set<string>(),
): boolean {
    if (visited.has(artifactId)) return false;
    visited.add(artifactId);
    const artifact = artifactsById.get(artifactId);
    if (!artifact) return false;
    for (const requiredId of artifact.requires) {
        if (
            requiredId === targetId ||
            transitiveRequires(requiredId, targetId, artifactsById, visited)
        ) {
            return true;
        }
    }
    return false;
}

function specialistFor(artifact: NormalizedArtifact): SpecialistPass {
    return artifact.id === "design" ? "designer" : "planner-generic";
}
