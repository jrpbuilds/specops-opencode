import { AGENT_IDS } from "../agents/ids.js";
import type { NormalizedApplyInstructionContext } from "../openspec/apply-instructions.js";
import type { NormalizedArtifact, NormalizedStatus } from "../openspec/status.js";
import type { ReviewFanoutProgress } from "./review-fanout.js";
import { derivePlanningCompletion } from "./planning-completion.js";
import { deriveWorkflowState } from "./workflow-state.js";
import { requiredClosure, transitiveRequires } from "./artifact-graph.js";

/** Native Todo state projected from durable OpenSpec workflow state. */
export type TodoProjectionStatus = "complete" | "in_progress" | "pending";

/** Specialist responsible for a planning artifact. */
export type TodoProjectionOwner =
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

/** Durable implementation progress and gate observations for the lifecycle stages. */
export type LifecycleProgressInput = {
    /** Normalized apply context feeding the canonical phase derivation; omitted ⇒ stages stay pending. */
    readonly apply?: NormalizedApplyInstructionContext;
    /** True when the coordinator was observed passing the implementation-entry gate this session. */
    readonly implementationEntered?: boolean;
};

/** Workflow stages appended once every planning artifact is complete. */
const FIXED_STAGES = [
    { id: "plan-approval", content: "Approve plan — checkpoint to approve or reject the plan" },
    { id: "implementation", content: "Implementation — build the approved tasks" },
    { id: "independent-review", content: "Independent review — verify against specs and design" },
] as const;

/** Auto-only stages that make bounded review correction visible in the projection. */
const AUTO_REVIEW_STAGES = [
    { id: "auto-review-remediation", content: "Remediate findings — fix what review flagged" },
    { id: "auto-review-re-review", content: "Re-review — confirm the fixes hold" },
] as const;

/** Terminal lifecycle stage shared by interactive and Auto modes. */
const LIFECYCLE_STAGE = {
    id: "lifecycle-remediation",
    content: "Complete change — archive or remediate",
} as const;

/**
 * Build a complete Todo projection from one durable OpenSpec status snapshot.
 *
 * The optional mode only controls the interactive approval checkpoint. The
 * optional parallel input appends ephemeral fan-out and implementer-dispatch
 * entries after the serial stages. The optional lifecycle input advances the
 * post-plan stages from the canonical workflow phase — the same derivation
 * `specops_status` answers from. Every other entry and state is derived from
 * the supplied status without I/O or retained state.
 */
export function buildTodoProjection(
    status: NormalizedStatus,
    mode: TodoProjectionMode = "interactive",
    parallel?: ParallelProgressInput,
    lifecycle?: LifecycleProgressInput,
): TodoProjectionEntry[] {
    const artifactsById = new Map(status.artifacts.map(artifact => [artifact.id, artifact]));
    const closure = requiredClosure(status.applyRequires, artifactsById);
    const planningArtifacts = orderByReverseReachability(
        status.artifacts.filter(artifact => closure.has(artifact.id)),
        closure,
        artifactsById,
    );
    // The completion verdict is the canonical derivation shared with the
    // planning scheduler and status lifecycle, so the projection can never
    // disagree with either surface about the same durable state.
    const planningComplete = derivePlanningCompletion(status).complete;

    const entries: TodoProjectionEntry[] = [...planningArtifacts.map(toPlanningEntry)];

    if (planningComplete) {
        const stages = [
            ...FIXED_STAGES,
            ...(mode === "auto" ? AUTO_REVIEW_STAGES : []),
            LIFECYCLE_STAGE,
        ];
        const stageStatus = lifecycleStageStatus(status, lifecycle);
        for (const stage of stages) {
            if (stage.id === "plan-approval" && mode === "auto") continue;
            entries.push({ ...stage, status: stageStatus(stage.id) });
        }
    }

    // The evidence pass is part of authoring the first planning artifact, so
    // the fixup marks the first incomplete planning artifact (or, once
    // planning completes, the first stage the phase derivation left pending —
    // normally the approval checkpoint) as current work.
    const firstIncomplete = entries.findIndex(entry => entry.status !== "complete");
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

/**
 * Resolve lifecycle stage statuses from the canonical workflow phase — the
 * same `deriveWorkflowState` rule `specops_status` answers from, so the Todo
 * list can never contradict status about the same durable state. Without an
 * apply context every stage stays pending, and the firstIncomplete fixup
 * marks the approval checkpoint, preserving the pre-derivation behavior.
 * Implementation becomes current once the entry gate is observed or a task
 * checkbox lands; review becomes current once every task is done.
 */
function lifecycleStageStatus(
    status: NormalizedStatus,
    lifecycle?: LifecycleProgressInput,
): (stageId: string) => TodoProjectionStatus {
    if (!lifecycle?.apply) return () => "pending";
    const { phase } = deriveWorkflowState(status, lifecycle.apply);
    if (phase === "implementation") {
        const started =
            lifecycle.implementationEntered === true || lifecycle.apply.progress.complete > 0;
        if (!started) return () => "pending";
        return stageId =>
            stageId === "plan-approval"
                ? "complete"
                : stageId === "implementation"
                  ? "in_progress"
                  : "pending";
    }
    if (phase === "review") {
        return stageId =>
            stageId === "plan-approval" || stageId === "implementation"
                ? "complete"
                : stageId === "independent-review"
                  ? "in_progress"
                  : "pending";
    }
    return () => "pending";
}

/** Readable labels for default-schema planning artifacts; custom ids pass through. */
const PLANNING_LABELS: Readonly<Record<string, string>> = {
    proposal: "Author proposal — define the change's purpose and scope",
    specs: "Draft specs — write the requirement deltas for the change",
    design: "Design — decide the technical approach",
    tasks: "Plan tasks — break the work into implementation steps",
};

/** Project one planning artifact onto its Todo entry. */
function toPlanningEntry(artifact: NormalizedArtifact): TodoProjectionEntry {
    return {
        id: `planning:${artifact.id}`,
        content: PLANNING_LABELS[artifact.id] ?? artifact.id,
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
