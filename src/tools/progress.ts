import {
    summarizeReviewLanes,
    type ReviewLanesProgress,
    type ReviewLaneRoundSnapshot,
} from "../orchestrator/review-lanes.js";
import {
    projectImplementerDispatches,
    type ImplementerDispatchObservation,
    type ImplementerDispatchProgress,
} from "../orchestrator/implementer-progress.js";
import type { ApplyInstructionsResult } from "../openspec/apply-instructions.js";

/**
 * Progress views supplied by the host wrapper, derived from the runtime's
 * dispatch observation (`../host/parallel-progress.ts`) on every call — never
 * orchestrator-authored bookkeeping state.
 */
export type ProgressArgs = {
    readonly change: string;
    /** Active lane snapshot; omitted ⇒ the report states `reviewLanes: { active: false }`. */
    readonly reviewLanes?: ReviewLaneRoundSnapshot;
    /** Runtime-observed implementer dispatches; `[]` keeps the view present but empty. */
    readonly implementerDispatches?: readonly ImplementerDispatchObservation[];
};

/** Dependency boundary for the deterministic progress tool. */
export type ProgressDeps = {
    getApplyInstructions: (change: string) => Promise<ApplyInstructionsResult>;
};

/** Canonical JSON report returned by the tool core. */
export type ProgressReport = {
    readonly change: string;
    /** Active round: per-lane states; otherwise an explicit inactivity marker. */
    readonly reviewLanes: ReviewLanesProgress | { readonly active: false };
    readonly implementers?:
        | ({ readonly available: true } & ImplementerDispatchProgress)
        | { readonly available: false; readonly error: string };
};

/**
 * Project parallel progress onto a canonical JSON report.
 *
 * Deterministic, string-in/string-out like `status`: no I/O of its own, no
 * timestamps, no randomness — two identical calls with identical dep results
 * return byte-identical JSON. The `change`/`reviewLanes`/`implementers` key
 * order is fixed. A review-only call never invokes `getApplyInstructions`;
 * a durable read failure degrades only the implementer view, keeping the
 * review view intact. Malformed snapshots or dispatch observations fail
 * closed with non-JSON failure prefixes and no partial report.
 */
export async function progress(args: ProgressArgs, deps: ProgressDeps): Promise<string> {
    const name = args.change.trim();
    if (!name) return "An OpenSpec change name is required.";

    // Build in the fixed report key order; `implementers` is appended only
    // when requested, so JSON.stringify omits it for review-only calls.
    const report: {
        change: string;
        reviewLanes: ProgressReport["reviewLanes"];
        implementers?: ProgressReport["implementers"];
    } = {
        change: name,
        // No round observed means no lane state can be inferred.
        reviewLanes: { active: false },
    };

    if (args.reviewLanes !== undefined) {
        const summary = summarizeReviewLanes(args.reviewLanes);
        if (!summary.ok) {
            return `Invalid review lane snapshot for '${name}': ${summary.error}`;
        }
        if (args.reviewLanes.change !== name) {
            return `Invalid review lane snapshot for '${name}': round belongs to another change`;
        }
        report.reviewLanes = summary.progress;
    }

    if (args.implementerDispatches !== undefined) {
        const read = await deps.getApplyInstructions(name);
        if (!read.ok) {
            // Environmental failure, not caller input error: one view must
            // not erase the other.
            report.implementers = { available: false, error: read.error };
        } else {
            const projection = projectImplementerDispatches(
                args.implementerDispatches,
                read.context,
            );
            if (!projection.ok) {
                return `Invalid implementer dispatches for '${name}': ${projection.error}`;
            }
            report.implementers = { available: true, ...projection.progress };
        }
    }

    return JSON.stringify(report, null, 2);
}
