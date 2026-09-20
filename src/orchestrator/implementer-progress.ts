import type { NormalizedApplyInstructionContext } from "../openspec/apply-instructions.js";

/** One in-flight (or just-returned) implementer dispatch observed by the runtime. */
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
 * Label for one dispatch in deterministic error messages: its orchestrator
 * record id when present, else its 1-based position (`#2` for the second
 * dispatch), matching the todo-projection fallback id convention.
 */
function dispatchLabel(assignment: ImplementerAssignment, index: number): string {
    return assignment.dispatchId ?? `#${index + 1}`;
}

/**
 * Project runtime-observed implementer assignments onto durable checkbox
 * state.
 *
 * Pure reporting: this projection never gates anything by itself. The
 * implementer dispatch boundary consumes it through
 * `validateImplementerDispatchScope`, where the projection's
 * `missingFromDurable` and `durablyDone` results enforce the unknown-task and
 * complete-task invariants. Durable "currently unchecked" state is reported
 * as `durablyPending` and deliberately never enforced. It is not part of the
 * read-only `specops_progress` surface, whose implementer view is separately
 * runtime-observed.
 *
 * Pure over its two inputs: dispatch order and per-dispatch `taskIds` order
 * are preserved, no input is mutated, and the result is derived entirely from
 * the supplied assignments and the normalized apply-instruction context.
 *
 * Structural validation mirrors the assignment contract: non-empty, unique
 * within the dispatch, disjoint across siblings. Violations return `ok: false`
 * naming the offending task id and dispatch label (`dispatchId ?? '#<index>'`).
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

/**
 * One in-flight implementer dispatch as observed by the runtime's dispatch
 * tracking, supplied to the dispatch-boundary invariants.
 *
 * A dispatch whose `taskIds` is undefined holds the whole-list assignment
 * (every remaining unchecked task), so it overlaps every scoped sibling by
 * construction; the invariants treat that as active ownership, never as an
 * empty assignment.
 */
export type ActiveImplementerAssignment = {
    /** Stable label for the dispatch in deterministic error messages. */
    readonly dispatchId: string;
    /** Explicit scoped ids in assignment order; undefined marks a whole-list implementer. */
    readonly taskIds?: readonly string[];
};

/** Which implementer-dispatch invariant a rejection names. */
export type ImplementerDispatchInvariant =
    "capacity" | "ownership-overlap" | "assignment-contract" | "unknown-task" | "complete-task";

/** Outcome of the dispatch-boundary invariants: pass, or a named rejected invariant. */
export type ImplementerDispatchValidationResult =
    | { readonly ok: true }
    | {
          readonly ok: false;
          readonly invariant: ImplementerDispatchInvariant;
          readonly error: string;
      };

/** Detection and parse result for one dispatch prompt's assignment line. */
export type AssignedTaskIdsParse =
    | { readonly status: "absent" }
    | { readonly status: "present"; readonly taskIds: readonly string[] }
    | { readonly status: "malformed"; readonly reason: string };

/** The assignment token, detected at the start of a trimmed prompt line. */
const ASSIGNED_TASK_IDS_LINE_START = /^assignedTaskIds\b/;

/** The canonical line shape, matched against already-trimmed lines. */
// Keep both patterns free of overlapping quantifiers so uncontrolled prompts
// cannot trigger polynomial backtracking in the regex engine.
const ASSIGNED_TASK_IDS_LINE = /^assignedTaskIds:(.+)$/;

/**
 * Read the orchestrator's `assignedTaskIds` line from one dispatch prompt.
 *
 * Detection is line-anchored and parse is line-strict, so the whole-list
 * serial path passes through untouched even when its prose quotes the field
 * name — task descriptions legitimately mention `assignedTaskIds` in
 * ordinary sentences, and a mid-line mention must not poison a whole-list
 * dispatch. A line that starts with the token but does not match the
 * canonical shape is reported as malformed — never silently reinterpreted
 * as a whole-list dispatch, which would rewrite a scoped assignment into a
 * different one. The canonical form is exactly one line (after trimming the
 * line's own leading/trailing whitespace) reading
 * `assignedTaskIds: <id>, <id>`; ids carry no internal whitespace.
 */
export function parseAssignedTaskIds(prompt: string | undefined): AssignedTaskIdsParse {
    if (typeof prompt !== "string" || !prompt) return { status: "absent" };
    const lines = prompt.split(/\r?\n/).map(line => line.trim());
    if (!lines.some(line => ASSIGNED_TASK_IDS_LINE_START.test(line))) return { status: "absent" };

    const canonical = lines.filter(line => ASSIGNED_TASK_IDS_LINE.test(line));
    if (canonical.length === 0) {
        return {
            status: "malformed",
            reason: "assignedTaskIds appears but no line matches 'assignedTaskIds: <id>, <id>'",
        };
    }
    if (canonical.length > 1) {
        return { status: "malformed", reason: "multiple canonical assignedTaskIds lines" };
    }

    const rest = canonical[0].slice("assignedTaskIds:".length);
    const ids = rest.split(",").map(id => id.trim());
    if (!rest.trim()) return { status: "malformed", reason: "empty id list" };
    for (const id of ids) {
        if (!id) return { status: "malformed", reason: "empty id in the list" };
        if (/\s/.test(id)) {
            return { status: "malformed", reason: `id '${id}' contains whitespace` };
        }
    }
    return { status: "present", taskIds: ids };
}

/**
 * Check implementer capacity against the configured concurrency ceiling.
 *
 * Applies to every implementer dispatch — scoped and whole-list alike —
 * because the ceiling bounds concurrent implementer dispatches, not
 * assignments. Pure accounting: the count is whatever the runtime observed.
 */
export function validateImplementerCapacity(input: {
    activeCount: number;
    maxConcurrency: number;
}): ImplementerDispatchValidationResult {
    if (input.activeCount + 1 > input.maxConcurrency) {
        return {
            ok: false,
            invariant: "capacity",
            error:
                `Invalid implementer dispatch: concurrency capacity is full ` +
                `(${input.activeCount} of ${input.maxConcurrency} implementer slots already in flight)`,
        };
    }
    return { ok: true };
}

/**
 * Check one implementer dispatch against active ownership.
 *
 * Ownership facts are pure runtime accounting — no durable read — so the
 * boundary evaluates them before touching the task list. The whole-list
 * assignment (every remaining unchecked task) overlaps every active
 * implementer by construction, and an active whole-list implementer holds
 * every task, so no scoped assignment can be disjoint from it. Rejections
 * name the overlap without repartitioning either side: reforming lanes is
 * orchestrator judgement.
 *
 * `taskIds === undefined` marks the dispatch being checked as whole-list.
 */
export function validateImplementerOwnership(input: {
    taskIds: readonly string[] | undefined;
    activeAssignments: readonly ActiveImplementerAssignment[];
}): ImplementerDispatchValidationResult {
    if (input.taskIds === undefined) {
        if (input.activeAssignments.length > 0) {
            return {
                ok: false,
                invariant: "ownership-overlap",
                error:
                    `Invalid implementer dispatch: the whole-list assignment overlaps ` +
                    `${input.activeAssignments.length} active implementer` +
                    `${input.activeAssignments.length === 1 ? "" : "s"}`,
            };
        }
        return { ok: true };
    }
    const wholeListSibling = input.activeAssignments.find(
        assignment => assignment.taskIds === undefined,
    );
    if (wholeListSibling) {
        return {
            ok: false,
            invariant: "ownership-overlap",
            error:
                `Invalid implementer dispatch: task assignment overlaps active implementer ` +
                `'${wholeListSibling.dispatchId}', which holds the whole-list assignment`,
        };
    }
    return { ok: true };
}

/**
 * Enforce the scoped-assignment invariants for one implementer dispatch
 * carrying an explicit `assignedTaskIds` list.
 *
 * Checks, in deterministic order:
 *
 * 1. ownership-overlap — the shared ownership pass: an active whole-list
 *    implementer holds every remaining task, so no scoped assignment can be
 *    disjoint from it;
 * 2. assignment-contract — the shared `projectImplementerAssignments` pass
 *    over the active scoped siblings plus this dispatch: non-empty list, ids
 *    unique within the dispatch, disjoint across dispatches;
 * 3. unknown-task — every assigned id must exist in the fresh canonical task
 *    list (`missingFromDurable` is reported by the projection but enforced
 *    only here, at the boundary);
 * 4. complete-task — every assigned id must be currently unchecked
 *    (`durablyDone` likewise). Siblings' own mid-flight completions are
 *    legitimate and never penalized: only this dispatch's classification is
 *    enforced.
 *
 * Rejections name the violated invariant and the offending ids without
 * prescribing a replacement lane plan.
 */
export function validateImplementerDispatchScope(input: {
    taskIds: readonly string[];
    activeAssignments: readonly ActiveImplementerAssignment[];
    applyContext: NormalizedApplyInstructionContext;
}): ImplementerDispatchValidationResult {
    const ownership = validateImplementerOwnership({
        taskIds: input.taskIds,
        activeAssignments: input.activeAssignments,
    });
    if (!ownership.ok) return ownership;

    const scopedSiblings = input.activeAssignments.filter(
        (assignment): assignment is ActiveImplementerAssignment & { taskIds: readonly string[] } =>
            assignment.taskIds !== undefined,
    );
    const projection = projectImplementerAssignments(
        [
            ...scopedSiblings.map(assignment => ({
                dispatchId: assignment.dispatchId,
                taskIds: assignment.taskIds,
            })),
            { taskIds: input.taskIds },
        ],
        input.applyContext,
    );
    if (!projection.ok) {
        return {
            ok: false,
            invariant: "assignment-contract",
            error: `Invalid implementer dispatch: ${projection.error}`,
        };
    }

    const scoped = projection.progress.dispatches[scopedSiblings.length];
    if (!scoped) {
        return {
            ok: false,
            invariant: "assignment-contract",
            error: "Invalid implementer dispatch: the assigned dispatch was not projected",
        };
    }
    if (scoped.missingFromDurable.length > 0) {
        const names = scoped.missingFromDurable.map(id => `'${id}'`).join(", ");
        return {
            ok: false,
            invariant: "unknown-task",
            error:
                `Invalid implementer dispatch: assigned task${scoped.missingFromDurable.length === 1 ? "" : "s"} ` +
                `${names} do${scoped.missingFromDurable.length === 1 ? "es" : ""} not exist in the current task list`,
        };
    }
    if (scoped.durablyDone.length > 0) {
        const names = scoped.durablyDone.map(id => `'${id}'`).join(", ");
        return {
            ok: false,
            invariant: "complete-task",
            error:
                `Invalid implementer dispatch: assigned task${scoped.durablyDone.length === 1 ? "" : "s"} ` +
                `${names} ${scoped.durablyDone.length === 1 ? "is" : "are"} already complete`,
        };
    }
    return { ok: true };
}
