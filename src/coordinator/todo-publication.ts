/**
 * Map the deterministic Todo projection onto OpenCode's native todo items.
 *
 * Consumes the same normalized OpenSpec status already trusted by SpecOps and
 * produces the exact array accepted by OpenCode's builtin `todowrite` tool,
 * so the runtime-owned projection can be published through the host seam in
 * `src/host/todo-sync.ts`. The mapping is pure: identical durable state yields
 * identical items, and a publication failure upstream degrades to the
 * model-authored list without touching workflow state.
 *
 * Presentation scope: besides the durable derivation, the only extra entries
 * are the runtime-observed in-flight parallel dispatches spliced in by the
 * projection; completed work stays carried by the durable stages and task
 * checkboxes. Every item carries uniform medium priority: the list is
 * orientation, and priority must never become a prescription.
 *
 * Exports: `NativeTodoItem`, `buildNativeTodoProjection`.
 */
import type { NormalizedStatus } from "../openspec/status.js";
import {
    buildTodoProjection,
    type LifecycleProgressInput,
    type ParallelProgressInput,
    type TodoProjectionEntry,
    type TodoProjectionMode,
} from "./todo-projection.js";

/** One todo item accepted by OpenCode's native `todowrite` tool. */
export type NativeTodoItem = {
    id: string;
    content: string;
    status: "pending" | "in_progress" | "completed";
    priority: "medium";
};

/** Projection statuses mapped onto the native todo vocabulary. */
const NATIVE_STATUS: Record<TodoProjectionEntry["status"], NativeTodoItem["status"]> = {
    complete: "completed",
    in_progress: "in_progress",
    pending: "pending",
};

/**
 * Build the native todo list for one durable snapshot.
 *
 * Runs the canonical projection and maps each entry onto the native item
 * shape with stable ids and uniform priority, preserving the projection's
 * deterministic order.
 *
 * @param status Normalized OpenSpec status for the active change.
 * @param mode Coordinator mode selecting the auto-only review stages.
 * @param lifecycle Optional implementation progress advancing the post-plan
 * stages from the canonical workflow phase.
 * @param parallel Optional ephemeral parallel work from runtime dispatch
 *   observation, spliced after the stages they belong to.
 * @returns Native todo items in canonical projection order.
 */
export function buildNativeTodoProjection(
    status: NormalizedStatus,
    mode: TodoProjectionMode = "interactive",
    lifecycle?: LifecycleProgressInput,
    parallel?: ParallelProgressInput,
): NativeTodoItem[] {
    return buildTodoProjection(status, mode, parallel, lifecycle).map(entry => ({
        id: entry.id,
        content: entry.content,
        status: NATIVE_STATUS[entry.status],
        priority: "medium",
    }));
}
