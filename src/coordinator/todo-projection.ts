import { AGENT_IDS } from "../agents/ids.js";
import type { NormalizedArtifact, NormalizedStatus } from "../openspec/status.js";
import type { ReviewFanoutProgress } from "./review-fanout.js";
import { requiredClosure, transitiveRequires } from "./artifact-graph.js";

/** Native Todo state projected from durable OpenSpec workflow state. */
export type TodoProjectionStatus = "complete" | "in_progress" | "pending";

/** Specialist responsible for a planning artifact. */
export type TodoProjectionOwner =
    | typeof AGENT_IDS.explorer
    | typeof AGENT_IDS.designer
    | typeof AGENT_IDS.planner
    | typeof AGENT_IDS.implementer
    | typeof AGENT_IDS.reviewer;

/** One ephemeral Todo entry projected for the current SpecOps run. */
export type TodoProjectionEntry = {
    id: string;
    content: string;
    status: TodoProjectionStatus;
    owner?: TodoProjectionOwner;
};

/** Coordinator mode used when deciding whether to show the approval checkpoint. */
export type TodoProjectionMode = "interactive" | "auto";

/** Ephemeral parallel work reflected in the Todo projection. */
export type ParallelProgressInput = {
    /** Canonical fan-out progress computed once via `summarizeReviewFanout`. */
    readonly reviewFanout?: ReviewFanoutProgress;
    /** Implementer dispatches currently in flight or durably verified complete. */
    readonly implementerDispatches?: readonly {
        readonly dispatchId?: string;
        readonly state: "inFlight" | "completed";
    }[];
};

/** Workflow stages appended once every planning artifact is complete. */
const FIXED_STAGES = [
    { id: "plan-approval", content: "Plan approval checkpoint" },
    { id: "implementation", content: "Implementation" },
    { id: "independent-review", content: "Independent review" },
] as const;

/** Auto-only stages that make bounded review correction visible in the projection. */
const AUTO_REVIEW_STAGES = [
    { id: "auto-review-remediation", content: "Auto review remediation" },
    { id: "auto-review-re-review", content: "Auto review re-review" },
] as const;

/** Terminal lifecycle stage shared by interactive and Auto modes. */
const LIFECYCLE_STAGE = { id: "lifecycle-remediation", content: "Lifecycle/remediation" } as const;

/** Leading evidence stage owned by the explorer; omitted on conditional skips. */
const REPOSITORY_EVIDENCE_STAGE = {
    id: "repository-evidence",
    content: "Repository evidence",
    owner: AGENT_IDS.explorer,
} as const;

/**
 * Build a complete Todo projection from one durable OpenSpec status snapshot.
 *
 * The optional mode only controls the interactive approval checkpoint. The
 * Explorer entry is included by default and can be omitted when the
 * conditional-Explorer rule skips the pass. The optional parallel input
 * appends ephemeral fan-out and implementer-dispatch entries after the serial
 * stages. Every other entry and state is derived from the supplied status
 * without I/O or retained state.
 */
export function buildTodoProjection(
    status: NormalizedStatus,
    mode: TodoProjectionMode = "interactive",
    includeExplorer = true,
    parallel?: ParallelProgressInput,
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
        const stages = [
            ...FIXED_STAGES,
            ...(mode === "auto" ? AUTO_REVIEW_STAGES : []),
            LIFECYCLE_STAGE,
        ];
        for (const stage of stages) {
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

    if (parallel) entries.push(...parallelEntries(parallel));

    return entries;
}

/**
 * Project supplied parallel work onto entries appended after the serial
 * stages. Only in-flight and completed items are emitted — pending and failed
 * critics surface through coordinator reporting, not Todo state — and the
 * entries keep their explicit statuses because the firstIncomplete fixup ran
 * before they existed.
 */
function parallelEntries(parallel: ParallelProgressInput): TodoProjectionEntry[] {
    const entries: TodoProjectionEntry[] = [];
    for (const critic of parallel.reviewFanout?.critics ?? []) {
        if (critic.status !== "inFlight" && critic.status !== "completed") continue;
        entries.push({
            id: `review-critic:${critic.id}`,
            content: `Review critic: ${critic.id}`,
            status: critic.status === "inFlight" ? "in_progress" : "complete",
        });
    }
    (parallel.implementerDispatches ?? []).forEach((dispatch, index) => {
        const label = dispatch.dispatchId ?? `#${index + 1}`;
        entries.push({
            id: `implementer:${label}`,
            content: `Implementer dispatch ${label}`,
            status: dispatch.state === "completed" ? "complete" : "in_progress",
        });
    });
    return entries;
}

/** Project one planning artifact onto its Todo entry. */
function toPlanningEntry(artifact: NormalizedArtifact): TodoProjectionEntry {
    return {
        id: `planning:${artifact.id}`,
        content: artifact.id,
        status: isComplete(artifact) ? "complete" : "pending",
        owner: artifact.id === "design" ? AGENT_IDS.designer : AGENT_IDS.planner,
    };
}

/** An artifact counts as complete when OpenSpec marks it done or skipped. */
function isComplete(artifact: NormalizedArtifact): boolean {
    return artifact.status === "done" || artifact.status === "skipped";
}

/**
 * Order planning artifacts so dependents follow their dependencies: artifacts
 * required by more of the closure sort first.
 */
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

/** Count how many closure members transitively require the candidate. */
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
