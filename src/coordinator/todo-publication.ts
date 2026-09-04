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
 * Presentation scope: the projection derives from durable state only. The
 * repository-evidence pass is part of authoring the first planning artifact,
 * so it is not a separate checklist stage; ephemeral parallel entries arrive
 * with the later runtime event wiring (#53). Every item carries uniform
 * medium priority: the list is orientation, and priority must never become a
 * prescription.
 *
 * Exports: `NativeTodoItem`, `buildNativeTodoProjection`.
 */
import type { NormalizedStatus } from "../openspec/status.js";
import {
    buildTodoProjection,
    type LifecycleProgressInput,
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
 * @returns Native todo items in canonical projection order.
 */
export function buildNativeTodoProjection(
    status: NormalizedStatus,
    mode: TodoProjectionMode = "interactive",
    lifecycle?: LifecycleProgressInput,
): NativeTodoItem[] {
    return buildTodoProjection(status, mode, undefined, lifecycle).map(entry => ({
        id: entry.id,
        content: entry.content,
        status: NATIVE_STATUS[entry.status],
        priority: "medium",
    }));
}
