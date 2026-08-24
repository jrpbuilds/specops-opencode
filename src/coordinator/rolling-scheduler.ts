/**
 * Rolling bounded scheduler for coordinator-owned planning dispatches.
 *
 * Wraps the pure `nextBatch` selector with in-memory capacity accounting,
 * refills freed slots one completion at a time, and suspends new dispatches
 * while serial conditions are active. It never caches supplied status; every
 * dispatch is evaluated from the current durable OpenSpec state.
 *
 * Exports: `RollingScheduler`, `createRollingScheduler`.
 */
import type { NormalizedStatus } from "../openspec/status.js";
import { nextBatch, type PlanningRoute } from "./batching.js";

/** Live capacity view and dispatch controls for rolling planning. */
export interface RollingScheduler {
    /** Current number of author dispatches in flight. */
    readonly active: number;
    /** Whether a serial condition is preventing new dispatches. */
    readonly suspended: boolean;
    /** Free capacity, clamped to zero when active work reaches the limit. */
    readonly available: number;

    /**
     * Fill free capacity from the supplied normalized status.
     *
     * @param status Freshly read normalized OpenSpec status.
     * @returns Routes selected against the currently available capacity.
     */
    dispatch(status: NormalizedStatus): readonly PlanningRoute[];

    /**
     * Release the slot held by one in-flight artifact.
     *
     * @param artifactId Artifact whose specialist has completed.
     * @returns Whether the artifact was in flight and released a slot.
     */
    complete(artifactId: string): boolean;

    /** Halt new dispatches without cancelling in-flight siblings. */
    suspend(): void;

    /** Clear suspension so rolling dispatch can resume from fresh status. */
    resume(): void;
}

/**
 * Create a rolling scheduler bounded by the configured concurrency.
 *
 * @param maxConcurrency Maximum concurrently active specialist subagents.
 * @returns A scheduler with no in-flight dispatches and no suspension.
 */
export function createRollingScheduler(maxConcurrency: number): RollingScheduler {
    const inFlight = new Set<string>();
    let suspendedFlag = false;

    return {
        get active(): number {
            return inFlight.size;
        },
        get suspended(): boolean {
            return suspendedFlag;
        },
        get available(): number {
            return Math.max(0, maxConcurrency - inFlight.size);
        },
        dispatch(status: NormalizedStatus): readonly PlanningRoute[] {
            if (suspendedFlag) return [];
            const slots = Math.max(0, maxConcurrency - inFlight.size);
            if (slots === 0) return [];
            const routes = nextBatch(status, slots);
            for (const route of routes) {
                if (route.kind === "author") inFlight.add(route.artifactId);
            }
            return routes;
        },
        complete(artifactId: string): boolean {
            return inFlight.delete(artifactId);
        },
        suspend(): void {
            suspendedFlag = true;
        },
        resume(): void {
            suspendedFlag = false;
        },
    };
}
