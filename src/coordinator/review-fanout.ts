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

const REVIEW_CRITIC_IDS: readonly ReviewCriticId[] = ["correctness", "risk", "quality"];

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
