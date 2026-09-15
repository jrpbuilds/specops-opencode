/**
 * Runtime observation of one session's review cycle.
 *
 * The Todo projection's post-plan stages must advance through review
 * outcomes, remediation rounds, and re-review — but review verdicts are not
 * durable OpenSpec state, so the runtime observes them ephemerally from the
 * lifecycle calls it already sees and projects what it observed. This module
 * owns those observations; it never judges review content, never routes, and
 * never records a verdict as durable state.
 *
 * Observed events and their transitions:
 *
 * - a completed reviewer dispatch result is parsed by the strict verdict
 *   contract (`../coordinator/reviewer-verdict.ts`) — foreground results
 *   carry the raw final message, and background completions carry it inside
 *   the `<task … state="completed">` envelope's `<task_result>` wrapper: a
 *   PASS concludes the cycle; a FAIL opens the remediation round. Anything
 *   unresolved — including the dispatch-time `state="running"` envelope —
 *   leaves observed state unchanged;
 * - a review-role dispatch (critic or reviewer) while a FAIL cycle is active
 *   moves the round to re-review — remediation dispatches (implementer,
 *   planner, designer) are not review roles and never do;
 * - crossing the implementation-entry gate supersedes a concluded verdict:
 *   after a PASS, new implementation work means the durable phase governs
 *   the stages again. A crossing inside an active FAIL cycle keeps the
 *   cycle, because remediation dispatches also read apply instructions.
 *
 * The observers are session-scoped and fail open by construction: unbound
 * sessions pass through untouched and nothing is ever thrown — observation
 * must never break the model's tool call. All state lives in
 * `./session-bindings.ts` and dies with the process; a resume starts from
 * durable state and shows the durable-only projection until the run
 * re-observes these moments.
 *
 * Exports: `recordReviewDispatch`, `recordReviewResult`,
 * `observeImplementationGate`.
 */
import type { Hooks } from "@opencode-ai/plugin";
import { AGENT_IDS } from "../agents/ids.js";
import { parseReviewerVerdict } from "../coordinator/reviewer-verdict.js";
import {
    clearReviewCycle,
    getReviewCycle,
    getSessionBinding,
    markImplementationEntered,
    recordReviewCycle,
} from "./session-bindings.js";

/** Review-cycle observer hook input/output shapes, derived to stay compatible. */
type BeforeHookInput = Parameters<NonNullable<Hooks["tool.execute.before"]>>[0];
type BeforeHookOutput = Parameters<NonNullable<Hooks["tool.execute.before"]>>[1];
type AfterHookInput = Parameters<NonNullable<Hooks["tool.execute.after"]>>[0];
type AfterHookOutput = Parameters<NonNullable<Hooks["tool.execute.after"]>>[1];

/** Agent ids whose dispatches count as review work for the re-review round. */
const REVIEW_ROLE_IDS: readonly string[] = [
    AGENT_IDS.reviewer,
    AGENT_IDS.reviewCorrectness,
    AGENT_IDS.reviewRisk,
    AGENT_IDS.reviewQuality,
];

/**
 * Build the before-hook that observes review-role dispatches.
 *
 * A critic or reviewer dispatch during an active FAIL cycle begins the
 * re-review round; dispatches outside an active cycle are ordinary review
 * work the durable phase already projects.
 *
 * @param input The before-hook input identifying the tool call.
 * @param output The before-hook output carrying the dispatch args.
 */
export async function recordReviewDispatch(
    input: BeforeHookInput,
    output: BeforeHookOutput,
): Promise<void> {
    try {
        if (input.tool !== "task") return;
        if (!getSessionBinding(input.sessionID)) return;
        const subagentType = output?.args?.subagent_type;
        if (typeof subagentType !== "string" || !REVIEW_ROLE_IDS.includes(subagentType)) return;
        const cycle = getReviewCycle(input.sessionID);
        if (cycle?.verdict !== "fail" || cycle.round === "re-review") return;
        recordReviewCycle(input.sessionID, { verdict: "fail", round: "re-review" });
    } catch {
        // Fail open: observation must never break the model's task dispatch.
    }
}

/**
 * Build the after-hook that observes the reviewer's terminal verdict from a
 * completed result. Foreground results carry the raw final message, and
 * background completions carry it inside the `<task … state="completed">`
 * envelope's `<task_result>` wrapper; both parse. The dispatch-time running
 * envelope carries no verdict and degrades to the durable projection.
 *
 * @param input The after-hook input identifying the tool call and its args.
 * @param output The after-hook output carrying the result text.
 */
export async function recordReviewResult(
    input: AfterHookInput,
    output: AfterHookOutput,
): Promise<void> {
    try {
        if (input.tool !== "task") return;
        if (input.args?.subagent_type !== AGENT_IDS.reviewer) return;
        if (!getSessionBinding(input.sessionID)) return;
        const verdict = parseReviewerVerdict(output?.output);
        if (!verdict) return;
        recordReviewCycle(
            input.sessionID,
            verdict === "pass" ? { verdict: "pass" } : { verdict: "fail", round: "remediation" },
        );
    } catch {
        // Fail open: observation must never break a specialist result.
    }
}

/**
 * Observe one session crossing the implementation-entry gate.
 *
 * Marks the gate for the projection's implementation stage and applies the
 * cycle-supersession rule: a concluded verdict (a PASS with no active round)
 * is cleared so the durable phase governs again — new implementation work
 * after a passed review needs its own review. An active FAIL cycle survives
 * the crossing because remediation dispatches read apply instructions too.
 *
 * @param sessionID OpenCode session identifier from the hook input.
 */
export function observeImplementationGate(sessionID: string): void {
    markImplementationEntered(sessionID);
    const cycle = getReviewCycle(sessionID);
    if (cycle?.verdict && !cycle.round) clearReviewCycle(sessionID);
}
