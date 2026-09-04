import type { NormalizedApplyInstructionContext } from "../openspec/apply-instructions.js";

/** One in-flight (or just-returned) implementer dispatch, coordinator-supplied. */
export type ImplementerAssignment = {
    readonly dispatchId?: string;
    readonly taskIds: readonly string[];
};

/** Per-dispatch comparison of assigned tasks against durable checkbox state. */
export type ImplementerAssignmentProgress = {
    /** Omitted from the JSON output when the input dispatch carries no id. */
    readonly dispatchId?: string;
    /** Assigned task ids in input order. */
    readonly assigned: readonly string[];
    /** Assigned task ids whose durable checkbox is checked. */
    readonly durablyDone: readonly string[];
    /** Assigned task ids whose durable checkbox is unchecked (reported, never enforced). */
    readonly durablyPending: readonly string[];
    /** Assigned task ids absent from the durable task list. */
    readonly missingFromDurable: readonly string[];
};

/** Overall implementer progress across all supplied dispatches. */
export type ImplementerProgress = {
    readonly dispatches: readonly ImplementerAssignmentProgress[];
    readonly totals: {
        readonly dispatches: number;
        readonly assignedTasks: number;
        readonly durablyDone: number;
        readonly durablyPending: number;
        readonly missingFromDurable: number;
    };
};

export type ImplementerProgressResult =
    | { readonly ok: true; readonly progress: ImplementerProgress }
    | { readonly ok: false; readonly error: string };

/**
 * Label for one dispatch in deterministic error messages: its coordinator
 * record id when present, else its 1-based position (`#2` for the second
 * dispatch), matching the todo-projection fallback id convention.
 */
function dispatchLabel(assignment: ImplementerAssignment, index: number): string {
    return assignment.dispatchId ?? `#${index + 1}`;
}

/**
 * Project the coordinator's in-flight implementer assignments onto durable
 * checkbox state.
 *
 * Pure over its two inputs: dispatch order and per-dispatch `taskIds` order
 * are preserved, no input is mutated, and the result is derived entirely from
 * the supplied assignments and the normalized apply-instruction context.
 *
 * Structural validation mirrors the coordinator's own assignment contract:
 * non-empty, unique within the dispatch, disjoint across siblings. Violations
 * return `ok: false` naming the offending task id and dispatch label
 * (`dispatchId ?? '#<index>'`). Durable "currently unchecked" state is
 * deliberately reported as `durablyPending`, never enforced — this projection
 * is a read-only reporting aid, not gating.
 */
export function projectImplementerAssignments(
    assignments: readonly ImplementerAssignment[],
    applyContext: NormalizedApplyInstructionContext,
): ImplementerProgressResult {
    const labels = assignments.map(dispatchLabel);

    for (let index = 0; index < assignments.length; index++) {
        const assignment = assignments[index];
        if (assignment.taskIds.length === 0) {
            return { ok: false, error: `dispatch ${labels[index]} has an empty taskIds list` };
        }
        const seen = new Set<string>();
        for (const taskId of assignment.taskIds) {
            if (seen.has(taskId)) {
                return {
                    ok: false,
                    error: `task '${taskId}' assigned multiple times in dispatch ${labels[index]}`,
                };
            }
            seen.add(taskId);
        }
    }

    const labelsByTask = new Map<string, string[]>();
    for (let index = 0; index < assignments.length; index++) {
        for (const taskId of assignments[index].taskIds) {
            const taskLabels = labelsByTask.get(taskId);
            if (taskLabels) taskLabels.push(labels[index]);
            else labelsByTask.set(taskId, [labels[index]]);
        }
    }
    for (const [taskId, taskLabels] of labelsByTask) {
        if (taskLabels.length > 1) {
            return {
                ok: false,
                error: `task '${taskId}' assigned to multiple dispatches (${taskLabels.join(", ")})`,
            };
        }
    }

    const doneById = new Map(applyContext.tasks.map(task => [task.id, task.done]));
    const dispatches: ImplementerAssignmentProgress[] = [];
    const totals = {
        dispatches: assignments.length,
        assignedTasks: 0,
        durablyDone: 0,
        durablyPending: 0,
        missingFromDurable: 0,
    };

    for (let index = 0; index < assignments.length; index++) {
        const assignment = assignments[index];
        const durablyDone: string[] = [];
        const durablyPending: string[] = [];
        const missingFromDurable: string[] = [];
        for (const taskId of assignment.taskIds) {
            const done = doneById.get(taskId);
            if (done === undefined) missingFromDurable.push(taskId);
            else if (done) durablyDone.push(taskId);
            else durablyPending.push(taskId);
        }
        totals.assignedTasks += assignment.taskIds.length;
        totals.durablyDone += durablyDone.length;
        totals.durablyPending += durablyPending.length;
        totals.missingFromDurable += missingFromDurable.length;
        dispatches.push({
            // Keep the key absent (not undefined) so the JSON output omits it
            // when the input dispatch carries no id.
            ...(assignment.dispatchId === undefined ? {} : { dispatchId: assignment.dispatchId }),
            assigned: [...assignment.taskIds],
            durablyDone,
            durablyPending,
            missingFromDurable,
        });
    }

    return { ok: true, progress: { dispatches, totals } };
}

/** Terminal-or-current state of one runtime-observed implementer dispatch. */
export type ImplementerDispatchState = "inFlight" | "completed" | "failed";

/** One runtime-observed implementer dispatch supplied to the projection. */
export type ImplementerDispatchObservation = {
    /** Background task id (child session id) when the runtime linked one. */
    readonly dispatchId?: string;
    readonly state: ImplementerDispatchState;
};

/** Dispatch-level progress reconciled against the change's durable counters. */
export type ImplementerDispatchProgress = {
    readonly dispatches: readonly ImplementerDispatchObservation[];
    /**
     * Durable task counters from the fresh apply-instruction context: the
     * authoritative completion view a stale dispatch state can never overrule.
     */
    readonly durable: {
        readonly total: number;
        readonly complete: number;
        readonly remaining: number;
    };
};

export type ImplementerDispatchProgressResult =
    | { readonly ok: true; readonly progress: ImplementerDispatchProgress }
    | { readonly ok: false; readonly error: string };

/**
 * Project runtime-observed implementer dispatches alongside fresh durable task
 * counters.
 *
 * The runtime observes dispatch lifecycle but not per-dispatch task ids, so
 * this projection reports each dispatch's observed state verbatim and
 * reconciles completion at the change level against the authoritative durable
 * counters — a stale `inFlight` projection can therefore never hide durably
 * finished work. Pure over its inputs: dispatch order is preserved, nothing is
 * mutated, and identical inputs yield identical results.
 */
export function projectImplementerDispatches(
    dispatches: readonly ImplementerDispatchObservation[],
    applyContext: NormalizedApplyInstructionContext,
): ImplementerDispatchProgressResult {
    for (let index = 0; index < dispatches.length; index++) {
        const dispatch = dispatches[index];
        if (
            dispatch.state !== "inFlight" &&
            dispatch.state !== "completed" &&
            dispatch.state !== "failed"
        ) {
            return {
                ok: false,
                error: `dispatch ${dispatch.dispatchId ?? `#${index + 1}`} has an unknown state`,
            };
        }
    }
    return {
        ok: true,
        progress: {
            dispatches: dispatches.map(dispatch =>
                dispatch.dispatchId === undefined
                    ? { state: dispatch.state }
                    : { dispatchId: dispatch.dispatchId, state: dispatch.state },
            ),
            durable: {
                total: applyContext.progress.total,
                complete: applyContext.progress.complete,
                remaining: applyContext.progress.remaining,
            },
        },
    };
}
