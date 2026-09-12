/**
 * Deterministic enforcement of the implementer-assignment invariants at the
 * dispatch boundary.
 *
 * The Coordinator owns whether a change uses parallel implementation, which
 * tasks form a coherent lane, and which legal lane runs first — those stay
 * judgements and are never encoded here. What this boundary owns is the
 * objectively verifiable facts the workflow contract already states: a
 * dispatch's assignment is only valid when its ids exist in the current
 * canonical task list, are currently unchecked, are unique within the
 * dispatch, are disjoint from every active sibling, and stay within the
 * configured implementer concurrency. Enforcing them here replaces prompt
 * prose the Coordinator previously had to re-derive on every dispatch, and
 * the structured rejections let it revise its choice without a permanent
 * invariant manual.
 *
 * Blocking primitive: this hook throws on a rejected dispatch. OpenCode's
 * plugin bus awaits every hook handler with no catch, so a throw fails the
 * effect before the tool executes — the `task` call never starts and the
 * error message is surfaced to the Coordinator as the tool result. This is
 * the one SpecOps hook that deliberately fails closed: the sibling observers
 * (`./parallel-progress.ts`, `./review-cycle.ts`, `./todo-sync.ts`) must
 * never break a dispatch, while this boundary must never let an invalid one
 * through. Rejections name the violated invariant and the offending ids and
 * never prescribe a replacement lane plan; the runtime never regroups or
 * repartitions an invalid assignment into a different valid one — reforming
 * lanes is coordinator judgement.
 *
 * Pass-through cases: non-`task` tools, unbound sessions (no change context
 * to validate against), and dispatches whose `subagent_type` is not the
 * implementer. A dispatch with no line-initial `assignedTaskIds` token is
 * the whole-list serial path — it passes the capacity and ownership checks
 * and skips the durable read entirely, so the supported serial behaviour is
 * untouched, including whole-list prompts that quote task descriptions
 * mentioning the field in prose. A line that starts with the token but does
 * not match the canonical shape is rejected rather than reinterpreted as
 * whole-list, which would silently rewrite a scoped assignment into a
 * different dispatch; the deliberate tradeoff is that an off-contract
 * scoped assignment embedded mid-line is treated as whole-list rather than
 * failing the serial path. A durable read failure on a scoped dispatch
 * likewise blocks with the read error, because an assignment that cannot
 * be proven valid is not valid.
 *
 * Active ownership comes from the runtime's own dispatch observation
 * (`./parallel-progress.ts`) — in-flight implementer entries with their
 * parsed ids, process-scoped, dying with the session. Ownership is never
 * persisted and never becomes durable workflow authority; a resume starts
 * from empty runtime state and is validated against fresh durable task
 * state exactly like any other dispatch.
 *
 * Exports: `ImplementerDispatchGateDeps`, `createImplementerDispatchGate`.
 */
import type { Hooks } from "@opencode-ai/plugin";
import { AGENT_IDS } from "../agents/ids.js";
import type { SpecOpsConfig } from "../config.js";
import {
    parseAssignedTaskIds,
    validateImplementerCapacity,
    validateImplementerOwnership,
    validateImplementerDispatchScope,
} from "../coordinator/implementer-progress.js";
import type { ApplyInstructionsResult } from "../openspec/apply-instructions.js";
import { getSessionBinding } from "./session-bindings.js";
import {
    releaseImplementerDispatch,
    reserveImplementerDispatch,
    snapshotActiveImplementers,
} from "./parallel-progress.js";

/** Dependency boundary keeping the gate testable without a live OpenSpec CLI. */
export type ImplementerDispatchGateDeps = {
    /** Project directory the durable task read targets. */
    directory: string;
    getApplyInstructions: (change: string, cwd: string) => Promise<ApplyInstructionsResult>;
    /** Effective SpecOps configuration (concurrency ceiling). */
    getConfig: () => SpecOpsConfig;
};

/**
 * Build the `tool.execute.before` gate for implementer dispatches.
 *
 * Must compose before `recordTaskDispatch` so a rejected dispatch is never
 * recorded as active ownership. A passing dispatch is reserved synchronously
 * before any durable read, so concurrent gates see it before the observer
 * consumes the reservation.
 *
 * @param deps The durable task reader and effective configuration.
 * @returns A hook that throws to block a rejected dispatch and returns
 *     otherwise.
 */
export function createImplementerDispatchGate(
    deps: ImplementerDispatchGateDeps,
): NonNullable<Hooks["tool.execute.before"]> {
    return async (input, output) => {
        if (input.tool !== "task") return;
        const binding = getSessionBinding(input.sessionID);
        if (!binding) return;
        if (output?.args?.subagent_type !== AGENT_IDS.implementer) return;
        if (!input.callID) return;

        const config = deps.getConfig();
        const snapshot = snapshotActiveImplementers(input.sessionID);
        const capacity = validateImplementerCapacity({
            activeCount: snapshot.count,
            maxConcurrency: config.maxSubagentConcurrency,
        });
        if (!capacity.ok) throw new Error(capacity.error);

        const parse = parseAssignedTaskIds(
            typeof output?.args?.prompt === "string" ? output.args.prompt : undefined,
        );
        if (parse.status === "malformed") {
            throw new Error(
                `Invalid implementer dispatch: malformed assignedTaskIds payload (${parse.reason}); ` +
                    "send the assignment as one line reading 'assignedTaskIds: <id>, <id>'",
            );
        }
        const ownership = validateImplementerOwnership({
            taskIds: parse.status === "present" ? parse.taskIds : undefined,
            activeAssignments: snapshot.assignments,
        });
        if (!ownership.ok) throw new Error(ownership.error);

        const taskIds = parse.status === "present" ? parse.taskIds : undefined;
        reserveImplementerDispatch(input.sessionID, input.callID, taskIds);
        if (taskIds === undefined) return;

        try {
            const read = await deps.getApplyInstructions(binding.change, deps.directory);
            if (!read.ok) {
                throw new Error(
                    `Invalid implementer dispatch: the current task list could not be read for ` +
                        `'${binding.change}' (${read.error})`,
                );
            }
            const scoped = validateImplementerDispatchScope({
                taskIds,
                activeAssignments: snapshot.assignments,
                applyContext: read.context,
            });
            if (!scoped.ok) throw new Error(scoped.error);
        } catch (error) {
            releaseImplementerDispatch(input.sessionID, input.callID);
            throw error;
        }
    };
}
