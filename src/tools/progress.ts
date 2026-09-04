import {
    summarizeReviewFanout,
    type ReviewFanoutProgress,
    type ReviewFanoutSnapshot,
} from "../coordinator/review-fanout.js";
import {
    projectImplementerAssignments,
    projectImplementerDispatches,
    type ImplementerAssignment,
    type ImplementerDispatchObservation,
    type ImplementerDispatchProgress,
    type ImplementerProgress,
} from "../coordinator/implementer-progress.js";
import type { ApplyInstructionsResult } from "../openspec/apply-instructions.js";

/**
 * Ephemeral progress arguments. Either supplied explicitly by the coordinator
 * (the pre-#53 contract) or filled by the host from runtime-observed dispatch
 * state when the coordinator omits them.
 */
export type ProgressArgs = {
    readonly change: string;
    /** Fan-out snapshot; omitted ⇒ the report states `reviewFanout: { active: false }`. */
    readonly reviewFanout?: ReviewFanoutSnapshot;
    /** Implementer dispatches; `[]` counts as present. */
    readonly implementerAssignments?: readonly ImplementerAssignment[];
    /**
     * Runtime-observed implementer dispatches; `[]` counts as present.
     * Mutually exclusive with `implementerAssignments`.
     */
    readonly implementerDispatches?: readonly ImplementerDispatchObservation[];
};

/** Dependency boundary for the deterministic progress tool. */
export type ProgressDeps = {
    getApplyInstructions: (change: string) => Promise<ApplyInstructionsResult>;
};

/** Canonical JSON report returned by the tool core. */
export type ProgressReport = {
    readonly change: string;
    /** Active fan-out: per-critic statuses; otherwise an explicit inactivity marker. */
    readonly reviewFanout: ReviewFanoutProgress | { readonly active: false };
    readonly implementers?:
        | ({ readonly available: true } & ImplementerProgress)
        | ({ readonly available: true } & ImplementerDispatchProgress)
        | { readonly available: false; readonly error: string };
};

/**
 * Project parallel progress onto a canonical JSON report.
 *
 * Deterministic, string-in/string-out like `status`: no I/O, no timestamps, no
 * randomness — two identical calls with identical dep results return
 * byte-identical JSON. The `change`/`reviewFanout`/`implementers` key order is
 * fixed. A fan-out-only call never invokes `getApplyInstructions`; a durable
 * read failure degrades only the implementer view, keeping the fan-out view
 * intact. Supplied snapshots and assignments fail closed with non-JSON
 * failure prefixes and no partial report.
 *
 * The implementer view comes from exactly one source: coordinator-supplied
 * `implementerAssignments` (per-task durable reconciliation) or runtime-
 * observed `implementerDispatches` (dispatch-level state plus durable
 * change-level counters), never both.
 */
export async function progress(args: ProgressArgs, deps: ProgressDeps): Promise<string> {
    const name = args.change.trim();
    if (!name) return "An OpenSpec change name is required.";

    if (
        args.reviewFanout === undefined &&
        args.implementerAssignments === undefined &&
        args.implementerDispatches === undefined
    ) {
        return "Provide reviewFanout, implementerAssignments, or implementerDispatches to report parallel progress.";
    }
    if (args.implementerAssignments !== undefined && args.implementerDispatches !== undefined) {
        return "Provide either implementerAssignments or implementerDispatches, not both.";
    }

    // Build in the fixed report key order; `implementers` is appended only
    // when requested, so JSON.stringify omits it for fan-out-only calls.
    const report: {
        change: string;
        reviewFanout: ProgressReport["reviewFanout"];
        implementers?: ProgressReport["implementers"];
    } = {
        change: name,
        // Explicit inactivity marker: no snapshot means no fan-out is running,
        // never an inferred per-critic state.
        reviewFanout: { active: false },
    };

    if (args.reviewFanout !== undefined) {
        const summary = summarizeReviewFanout(args.reviewFanout);
        if (!summary.ok) {
            return `Invalid review fan-out snapshot for '${name}': ${summary.error}`;
        }
        report.reviewFanout = summary.progress;
    }

    if (args.implementerAssignments !== undefined) {
        const read = await deps.getApplyInstructions(name);
        if (!read.ok) {
            // Environmental failure, not coordinator input error: one view
            // must not erase the other.
            report.implementers = { available: false, error: read.error };
        } else {
            const projection = projectImplementerAssignments(
                args.implementerAssignments,
                read.context,
            );
            if (!projection.ok) {
                return `Invalid implementer assignments for '${name}': ${projection.error}`;
            }
            report.implementers = { available: true, ...projection.progress };
        }
    }

    if (args.implementerDispatches !== undefined) {
        const read = await deps.getApplyInstructions(name);
        if (!read.ok) {
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
