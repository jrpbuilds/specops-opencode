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
    /**
     * Implementer dispatches currently in flight. Completion is carried by
     * durable task checkboxes, and failures surface through coordinator
     * reporting, so neither is representable here.
     */
    readonly implementerDispatches?: readonly {
        readonly dispatchId?: string;
        readonly state: "inFlight";
    }[];
};

/**
 * Ephemeral runtime observations of one session's review cycle: the latest
 * reviewer verdict and, after a FAIL, the active remediation round. The
 * runtime reads these from observed lifecycle calls; they are presentation
 * state only and never workflow authority.
 */
export type ReviewCycleObservation = {
    /** Latest reviewer verdict observed this session; omitted ⇒ none observed. */
    readonly verdict?: "pass" | "fail";
    /** Active fail-cycle round; present only while a FAIL's correction loop runs. */
    readonly round?: "remediation" | "re-review";
};

/** Durable implementation progress and gate observations for the lifecycle stages. */
export type LifecycleProgressInput = {
    /** Normalized apply context feeding the canonical phase derivation; omitted ⇒ stages stay pending. */
    readonly apply?: NormalizedApplyInstructionContext;
    /** True when the coordinator was observed passing the implementation-entry gate this session. */
    readonly implementationEntered?: boolean;
    /** Observed review-cycle state; a verdict takes precedence over the durable phase derivation. */
    readonly reviewCycle?: ReviewCycleObservation;
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
 * optional parallel input splices ephemeral in-flight work into the stages it
 * belongs to: implementer dispatches after the implementation stage, review
 * critics after the independent-review stage. The optional lifecycle input
 * advances the post-plan stages from the canonical workflow phase — the same
 * derivation `specops_status` answers from. Every other entry and state is
 * derived from the supplied status without I/O or retained state.
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
        const stageStatus = lifecycleStageStatus(status, lifecycle, mode);
        for (const stage of stages) {
            if (stage.id === "plan-approval" && mode === "auto") continue;
            entries.push({ ...stage, status: stageStatus(stage.id) });
        }
    }

    // The evidence pass is part of authoring the first planning artifact, so
    // the fixup marks the first incomplete planning artifact (or, once
    // planning completes, the first stage the phase derivation left pending —
    // normally the approval checkpoint) as current work. Observed positions
    // win: the fixup only fills the gap when nothing is already current.
    const current = entries.find(entry => entry.status === "in_progress");
    if (!current) {
        const firstIncomplete = entries.findIndex(entry => entry.status !== "complete");
        if (firstIncomplete >= 0) entries[firstIncomplete].status = "in_progress";
    }

    if (parallel) insertParallelEntries(entries, parallel);

    return entries;
}

/** Stage ids anchoring where ephemeral parallel work is spliced in. */
const IMPLEMENTATION_STAGE_ID = "implementation";
const INDEPENDENT_REVIEW_STAGE_ID = "independent-review";

/**
 * Compact display label for one in-flight implementer dispatch: the first
 * eight characters of its background task id in parens, or a positional
 * marker when the runtime linked no id.
 */
function implementerLabel(dispatchId: string | undefined, index: number): string {
    return dispatchId ? `(${dispatchId.slice(0, 8)})` : `#${index + 1}`;
}

/**
 * Splice ephemeral parallel work into the serial stages at the points the
 * work actually belongs: in-flight implementer dispatches follow the
 * implementation stage, in-flight review critics follow the independent-
 * review stage. Only in-flight work is projected — completed work is already
 * reflected by the durable stages and task checkboxes, and pending and failed
 * items surface through coordinator reporting — so the list stays
 * orientation, never history. Entries keep their explicit statuses because
 * the firstIncomplete fixup ran before they existed. A missing anchor stage
 * (tracked work should never outlive its phase) falls back to appending.
 */
function insertParallelEntries(
    entries: TodoProjectionEntry[],
    parallel: ParallelProgressInput,
): void {
    const insertAfter = (stageId: string, newEntries: readonly TodoProjectionEntry[]): void => {
        if (newEntries.length === 0) return;
        const anchor = entries.findIndex(entry => entry.id === stageId);
        if (anchor === -1) {
            entries.push(...newEntries);
            return;
        }
        entries.splice(anchor + 1, 0, ...newEntries);
    };

    insertAfter(
        IMPLEMENTATION_STAGE_ID,
        (parallel.implementerDispatches ?? [])
            .filter(dispatch => dispatch.state === "inFlight")
            .map((dispatch, index) => ({
                id: `implementer:${dispatch.dispatchId ?? `#${index + 1}`}`,
                content: `Implementer dispatch ${implementerLabel(dispatch.dispatchId, index)}`,
                status: "in_progress" as const,
            })),
    );
    insertAfter(
        INDEPENDENT_REVIEW_STAGE_ID,
        (parallel.reviewFanout?.critics ?? [])
            .filter(critic => critic.status === "inFlight")
            .map(critic => ({
                id: `review-critic:${critic.id}`,
                content: `Review critic: ${critic.id}`,
                status: "in_progress" as const,
            })),
    );
}

/**
 * Resolve lifecycle stage statuses from the canonical workflow phase — the
 * same `deriveWorkflowState` rule `specops_status` answers from, so the Todo
 * list can never contradict status about the same durable state. Without an
 * apply context every stage stays pending, and the firstIncomplete fixup
 * marks the approval checkpoint, preserving the pre-derivation behavior.
 * Implementation becomes current once the entry gate is observed or a task
 * checkbox lands; review becomes current once every task is done.
 *
 * An observed reviewer verdict takes precedence: the review round executed,
 * so the verdict — pass or fail — completes the review stage and hands the
 * current-work position to the cycle stages (remediation and re-review in
 * Auto mode, the terminal archive-or-remediate stage in interactive mode).
 * Implementation stays complete for the whole cycle: post-review task
 * additions are remediation work, carried by the cycle stages, and a fresh
 * implementation-entry gate crossing without an active cycle clears the
 * verdict so durable state governs again.
 */
function lifecycleStageStatus(
    status: NormalizedStatus,
    lifecycle: LifecycleProgressInput | undefined,
    mode: TodoProjectionMode,
): (stageId: string) => TodoProjectionStatus {
    const cycle = lifecycle?.reviewCycle;
    if (cycle?.verdict) return reviewCycleStageStatus(cycle, mode);
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

/**
 * Resolve post-plan stage statuses from the observed review cycle. Stage
 * semantics follow round execution: the initial review round completed once
 * a verdict exists; a FAIL keeps the cycle active with remediation current
 * until a review-role re-dispatch moves work into the re-review round; a
 * PASS concludes the cycle and leaves the terminal archive-or-remediate
 * decision current. Auto-only stages complete vacuously on a first-round
 * PASS so the list never dangles on stages that have nothing left to do.
 */
function reviewCycleStageStatus(
    cycle: ReviewCycleObservation,
    mode: TodoProjectionMode,
): (stageId: string) => TodoProjectionStatus {
    const passed = cycle.verdict === "pass";
    // A recorded FAIL always carries a round; default defensively to the
    // remediation position should one ever be missing.
    const round = passed ? undefined : (cycle.round ?? "remediation");
    return stageId => {
        switch (stageId) {
            case "plan-approval":
            case "implementation":
                return "complete";
            case "independent-review":
                return round === "re-review" ? "in_progress" : "complete";
            case "auto-review-remediation":
                if (mode !== "auto") return "pending";
                return round === "remediation" ? "in_progress" : "complete";
            case "auto-review-re-review":
                if (mode !== "auto") return "pending";
                return round === "re-review" ? "in_progress" : passed ? "complete" : "pending";
            case "lifecycle-remediation":
                if (passed) return "in_progress";
                // A FAIL keeps the terminal stage current only while
                // remediation runs or the archive-or-remediate decision is
                // open (interactive mode); the re-review round returns
                // current work to the review stage.
                return round === "remediation" && mode === "interactive"
                    ? "in_progress"
                    : "pending";
            default:
                return "pending";
        }
    };
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
