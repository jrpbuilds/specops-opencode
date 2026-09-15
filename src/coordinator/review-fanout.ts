/**
 * Canonical review-critic identity and snapshot projection.
 *
 * Defines the stable critic ids the runtime uses to identify independent
 * review lenses, and validates/projects a review fan-out snapshot onto
 * canonical per-critic progress for the read-only progress view and the Todo
 * projection.
 */

/** Stable identifiers for the three independent review critics. */
export type ReviewCriticId = "correctness" | "risk" | "quality";

/** Canonical critic ids in projection order. */
export const REVIEW_CRITIC_IDS: readonly ReviewCriticId[] = ["correctness", "risk", "quality"];

/**
 * Ephemeral snapshot of one fan-out round, derived from the runtime's dispatch
 * observations and injected host-side. The state lists are individually
 * optional at the boundary, but a well-formed snapshot supplies all four (an
 * empty list is valid and distinct from an absent list).
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
 * closed on any snapshot that is not well-formed: all four state lists must be
 * present (an empty list is valid and distinct from an absent list), every
 * entry must be a known critic id, and each canonical critic must appear in
 * exactly one set.
 *
 * @param snapshot Ephemeral copy of the fan-out state.
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
