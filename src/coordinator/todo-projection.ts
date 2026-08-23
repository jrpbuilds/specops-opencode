import type { NormalizedArtifact, NormalizedStatus } from "../openspec/status.js";
import { requiredClosure, transitiveRequires } from "./artifact-graph.js";

/** Native Todo state projected from durable OpenSpec workflow state. */
export type TodoProjectionStatus = "complete" | "in_progress" | "pending";

/** Specialist responsible for a planning artifact. */
export type TodoProjectionOwner =
    | "specops-explorer"
    | "specops-designer"
    | "specops-planner"
    | "specops-implementer"
    | "specops-reviewer";

/** One ephemeral Todo entry projected for the current SpecOps run. */
export type TodoProjectionEntry = {
    id: string;
    content: string;
    status: TodoProjectionStatus;
    owner?: TodoProjectionOwner;
};

/** Coordinator mode used when deciding whether to show the approval checkpoint. */
export type TodoProjectionMode = "interactive" | "auto";

const FIXED_STAGES = [
    { id: "plan-approval", content: "Plan approval checkpoint" },
    { id: "implementation", content: "Implementation" },
    { id: "independent-review", content: "Independent review" },
    { id: "lifecycle-remediation", content: "Lifecycle/remediation" },
] as const;

const REPOSITORY_EVIDENCE_STAGE = {
    id: "repository-evidence",
    content: "Repository evidence",
    owner: "specops-explorer",
} as const;

/**
 * Build a complete Todo projection from one durable OpenSpec status snapshot.
 *
 * The optional mode only controls the interactive approval checkpoint. The
 * Explorer entry is included by default and can be omitted when the
 * conditional-Explorer rule skips the pass. Every other entry and state is
 * derived from the supplied status without I/O or retained state.
 */
export function buildTodoProjection(
    status: NormalizedStatus,
    mode: TodoProjectionMode = "interactive",
    includeExplorer = true,
): TodoProjectionEntry[] {
    const artifactsById = new Map(status.artifacts.map(artifact => [artifact.id, artifact]));
    const closure = requiredClosure(status.applyRequires, artifactsById);
    const planningArtifacts = orderByReverseReachability(
        status.artifacts.filter(artifact => closure.has(artifact.id)),
        closure,
        artifactsById,
    );
    const satisfied = new Set(
        planningArtifacts.filter(artifact => isComplete(artifact)).map(artifact => artifact.id),
    );
    const planningComplete =
        planningArtifacts.every(artifact => isComplete(artifact)) &&
        [...closure].every(artifactId => satisfied.has(artifactId)) &&
        status.isPlanningComplete !== false;

    const entries: TodoProjectionEntry[] = [
        ...(includeExplorer
            ? [
                  {
                      ...REPOSITORY_EVIDENCE_STAGE,
                      status: planningComplete ? ("pending" as const) : ("in_progress" as const),
                  },
              ]
            : []),
        ...planningArtifacts.map(toPlanningEntry),
    ];

    if (planningComplete) {
        for (const stage of FIXED_STAGES) {
            if (stage.id === "plan-approval" && mode === "auto") continue;
            entries.push({ ...stage, status: "pending" });
        }
    }

    const firstIncomplete = entries.findIndex(
        entry =>
            entry.status !== "complete" &&
            !(planningComplete && entry.id === REPOSITORY_EVIDENCE_STAGE.id),
    );
    if (firstIncomplete >= 0) entries[firstIncomplete].status = "in_progress";

    return entries;
}

function toPlanningEntry(artifact: NormalizedArtifact): TodoProjectionEntry {
    return {
        id: `planning:${artifact.id}`,
        content: artifact.id,
        status: isComplete(artifact) ? "complete" : "pending",
        owner: artifact.id === "design" ? "specops-designer" : "specops-planner",
    };
}

function isComplete(artifact: NormalizedArtifact): boolean {
    return artifact.status === "done" || artifact.status === "skipped";
}

function orderByReverseReachability(
    artifacts: readonly NormalizedArtifact[],
    closure: ReadonlySet<string>,
    artifactsById: ReadonlyMap<string, NormalizedArtifact>,
): NormalizedArtifact[] {
    const order = new Map(artifacts.map((artifact, index) => [artifact.id, index]));
    return [...artifacts].sort((left, right) => {
        const scoreDifference =
            reverseReachabilityScore(right, closure, artifactsById) -
            reverseReachabilityScore(left, closure, artifactsById);
        return scoreDifference || order.get(left.id)! - order.get(right.id)!;
    });
}

function reverseReachabilityScore(
    candidate: NormalizedArtifact,
    closure: ReadonlySet<string>,
    artifactsById: ReadonlyMap<string, NormalizedArtifact>,
): number {
    return [...closure].filter(
        artifactId =>
            artifactId !== candidate.id &&
            transitiveRequires(artifactId, candidate.id, artifactsById),
    ).length;
}
