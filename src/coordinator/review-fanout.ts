/**
 * Rolling bounded scheduler for the independent review critics.
 *
 * The coordinator prompt uses this module as an executable contract, just as
 * it uses `rolling-scheduler.ts` for planning. A critic failure permanently
 * closes the final-review fan-in gate, but does not cancel active siblings or
 * prevent pending critics from finishing safely.
 */

/** Stable identifiers for the three independent review critics. */
export type ReviewCriticId = "correctness" | "risk" | "quality";

/** Canonical critic ids in projection order. */
export const REVIEW_CRITIC_IDS: readonly ReviewCriticId[] = ["correctness", "risk", "quality"];

/** Live state and controls for one review fan-out round. */
export interface ReviewFanout {
    /** Number of critics dispatched but not yet complete or failed. */
    readonly active: number;
    /** Free critic slots under the configured concurrency limit. */
    readonly available: number;
    /** Whether a critic failure has permanently closed the fan-in gate. */
    readonly blocked: boolean;
    /** Critics that have not been dispatched, in canonical order. */
    readonly pending: readonly ReviewCriticId[];
    /** Critics currently dispatched and awaiting a terminal result. */
    readonly inFlight: readonly ReviewCriticId[];
    /** Critics that returned a report, in canonical order. */
    readonly completed: readonly ReviewCriticId[];
    /** Critics that failed without a usable report, in canonical order. */
    readonly failed: readonly ReviewCriticId[];

    /** Fill available slots from the remaining critics. */
    dispatch(): readonly ReviewCriticId[];

    /** Record one critic's completed report exactly as returned. */
    complete(id: ReviewCriticId, report: string): boolean;

    /** Mark one pending or active critic as failed and close final-review fan-in. */
    fail(id: ReviewCriticId): void;

    /** Return true only when all three critics completed without a failure. */
    allReportsCollected(): boolean;

    /** Return a non-mutating, canonically ordered snapshot of completed reports. */
    reports(): ReadonlyMap<ReviewCriticId, string>;

    /** Clear this round so the full fan-out can run again for remediation. */
    reset(): void;
}

/**
 * Create a review fan-out bounded by the configured concurrency.
 *
 * @param maxConcurrency Maximum number of review critics allowed in flight.
 * @returns A fresh fan-out with all critics pending and no failures.
 */
export function createReviewFanout(maxConcurrency: number): ReviewFanout {
    const pending = new Set<ReviewCriticId>(REVIEW_CRITIC_IDS);
    const inFlight = new Set<ReviewCriticId>();
    const completed = new Set<ReviewCriticId>();
    const failed = new Set<ReviewCriticId>();
    const completedReports = new Map<ReviewCriticId, string>();
    let blocked = false;

    const ordered = (members: ReadonlySet<ReviewCriticId>): readonly ReviewCriticId[] =>
        REVIEW_CRITIC_IDS.filter(id => members.has(id));

    return {
        get active(): number {
            return inFlight.size;
        },
        get available(): number {
            return Math.max(0, maxConcurrency - inFlight.size);
        },
        get blocked(): boolean {
            return blocked;
        },
        get pending(): readonly ReviewCriticId[] {
            return ordered(pending);
        },
        get inFlight(): readonly ReviewCriticId[] {
            return ordered(inFlight);
        },
        get completed(): readonly ReviewCriticId[] {
            return ordered(completed);
        },
        get failed(): readonly ReviewCriticId[] {
            return ordered(failed);
        },
        dispatch(): readonly ReviewCriticId[] {
            const slots = Math.max(0, maxConcurrency - inFlight.size);
            if (slots === 0) return [];

            const dispatched = ordered(pending).slice(0, slots);
            for (const id of dispatched) {
                pending.delete(id);
                inFlight.add(id);
            }
            return dispatched;
        },
        complete(id: ReviewCriticId, report: string): boolean {
            if (!inFlight.delete(id)) return false;
            completed.add(id);
            completedReports.set(id, report);
            return true;
        },
        fail(id: ReviewCriticId): void {
            if (completed.has(id) || failed.has(id)) return;

            const wasPending = pending.delete(id);
            const wasInFlight = inFlight.delete(id);
            if (!wasPending && !wasInFlight) return;

            failed.add(id);
            blocked = true;
        },
        allReportsCollected(): boolean {
            return !blocked && failed.size === 0 && completed.size === REVIEW_CRITIC_IDS.length;
        },
        reports(): ReadonlyMap<ReviewCriticId, string> {
            const snapshot = new Map<ReviewCriticId, string>();
            for (const id of REVIEW_CRITIC_IDS) {
                const report = completedReports.get(id);
                if (report !== undefined) snapshot.set(id, report);
            }
            return snapshot;
        },
        reset(): void {
            pending.clear();
            inFlight.clear();
            completed.clear();
            failed.clear();
            completedReports.clear();
            for (const id of REVIEW_CRITIC_IDS) pending.add(id);
            blocked = false;
        },
    };
}

/**
 * Ephemeral coordinator-supplied snapshot of one fan-out round. Host-boundary
 * shape: the lists are individually optional (matching the wrapper schema);
 * the runtime contract below requires all four present in any supplied
 * snapshot.
 */
export type ReviewFanoutSnapshot = {
    readonly pending?: readonly string[];
    readonly inFlight?: readonly string[];
    readonly completed?: readonly string[];
    readonly failed?: readonly string[];
};

/** One critic's terminal-or-current state in the projection. */
export type ReviewFanoutCriticStatus = "pending" | "inFlight" | "completed" | "failed";

/** Canonical per-critic progress derived from a snapshot. */
export type ReviewFanoutProgress = {
    readonly critics: readonly {
        readonly id: ReviewCriticId;
        readonly status: ReviewFanoutCriticStatus;
    }[];
    readonly counts: {
        readonly pending: number;
        readonly inFlight: number;
        readonly completed: number;
        readonly failed: number;
    };
};

export type ReviewFanoutSummaryResult =
    | { readonly ok: true; readonly progress: ReviewFanoutProgress }
    | { readonly ok: false; readonly error: string };

/** Snapshot state-list keys, in the same canonical order as the critics. */
const SNAPSHOT_LIST_KEYS = ["pending", "inFlight", "completed", "failed"] as const;

const isCriticId = (id: string): id is ReviewCriticId =>
    (REVIEW_CRITIC_IDS as readonly string[]).includes(id);

/**
 * Project a fan-out snapshot onto canonical per-critic progress.
 *
 * Pure: no I/O, no retained state, never mutates the input snapshot. Fails
 * closed on any snapshot the live `ReviewFanout` object could not have
 * produced: all four state lists must be present (an empty list is valid and
 * distinct from an absent list), every entry must be a known critic id, and
 * each canonical critic must appear in exactly one set.
 *
 * @param snapshot Coordinator-supplied copy of the fan-out state.
 * @returns Canonical per-critic progress, or a deterministic error message.
 */
export function summarizeReviewFanout(snapshot: ReviewFanoutSnapshot): ReviewFanoutSummaryResult {
    const missing = SNAPSHOT_LIST_KEYS.filter(key => snapshot[key] === undefined);
    if (missing.length > 0) {
        return {
            ok: false,
            error: `fan-out snapshot is missing state list(s): ${missing.join(", ")}`,
        };
    }

    const lists = SNAPSHOT_LIST_KEYS.map(key => ({ key, ids: snapshot[key] ?? [] }));

    const unknown: string[] = [];
    for (const { ids } of lists) {
        for (const id of ids) {
            if (!isCriticId(id) && !unknown.includes(id)) unknown.push(id);
        }
    }
    if (unknown.length > 0) {
        return {
            ok: false,
            error:
                unknown.length === 1
                    ? `unknown critic id '${unknown[0]}'`
                    : `unknown critic ids ${unknown.map(id => `'${id}'`).join(", ")}`,
        };
    }

    const statusByCritic = new Map<ReviewCriticId, ReviewFanoutCriticStatus>();
    for (const id of REVIEW_CRITIC_IDS) {
        const containing = lists.filter(({ ids }) => ids.includes(id));
        if (containing.length > 1) {
            return {
                ok: false,
                error: `critic '${id}' appears in both '${containing[0].key}' and '${containing[1].key}'`,
            };
        }
        if (containing.length === 0) {
            return { ok: false, error: `critic '${id}' is missing from all state lists` };
        }
        const { key, ids } = containing[0];
        if (ids.filter(entry => entry === id).length > 1) {
            return { ok: false, error: `critic '${id}' appears more than once in '${key}'` };
        }
        statusByCritic.set(id, key);
    }

    const critics = REVIEW_CRITIC_IDS.map(id => ({
        id,
        status: statusByCritic.get(id) as ReviewFanoutCriticStatus,
    }));
    const counts = { pending: 0, inFlight: 0, completed: 0, failed: 0 };
    for (const critic of critics) counts[critic.status] += 1;

    return { ok: true, progress: { critics, counts } };
}
