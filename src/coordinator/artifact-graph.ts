/**
 * Shared traversal primitives over the normalized OpenSpec artifact graph.
 *
 * Coordinator modules use these helpers to reason about `applyRequires`
 * closure and dependency reachability without duplicating graph walks.
 * Every function is pure: it never mutates the supplied lookup and retains
 * no state between calls.
 */
import type { NormalizedArtifact } from "../openspec/status.js";

/** Artifact-by-id lookup consumed by every graph helper. */
export type ArtifactsById = ReadonlyMap<string, NormalizedArtifact>;

/**
 * Compute the transitive artifact closure required by `applyRequires`.
 *
 * The iterative depth-first walk terminates safely for missing ids and cycles;
 * callers use the resulting set as their planning scope.
 *
 * @param applyRequires Root artifact ids required by the change.
 * @param artifactsById Artifact lookup containing `requires` edges.
 * @returns Every root and transitively required artifact id.
 */
export function requiredClosure(
    applyRequires: readonly string[],
    artifactsById: ArtifactsById,
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
 * Check whether an artifact transitively requires a target artifact.
 *
 * The visited set prevents cycles in malformed or custom schemas from causing
 * unbounded recursion. The set is local to one reachability query.
 *
 * @param artifactId Artifact whose dependency graph is traversed.
 * @param targetId Dependency id being searched for.
 * @param artifactsById Artifact lookup containing `requires` edges.
 * @param visited Artifact ids already visited during this query.
 * @returns Whether the target is a direct or transitive dependency.
 */
export function transitiveRequires(
    artifactId: string,
    targetId: string,
    artifactsById: ArtifactsById,
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
