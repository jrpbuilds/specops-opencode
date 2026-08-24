import { describe, expect, test } from "bun:test";
import { createRollingScheduler } from "../../src/coordinator/rolling-scheduler.js";
import type { NormalizedArtifact, NormalizedStatus } from "../../src/openspec/status.js";
import type { PlanningRoute } from "../../src/coordinator/batching.js";

const output = (id: string): string => `openspec/changes/example/${id}.md`;

function artifact(
    id: string,
    status: NormalizedArtifact["status"],
    requires: readonly string[] = [],
    outputPath = output(id),
): NormalizedArtifact {
    return { id, outputPath, status, requires };
}

function fixture(
    artifacts: readonly NormalizedArtifact[],
    applyRequires: readonly string[],
    isPlanningComplete?: boolean,
): NormalizedStatus {
    return {
        changeName: "example",
        schemaName: "spec-driven",
        applyRequires,
        artifacts,
        ...(isPlanningComplete === undefined ? {} : { isPlanningComplete }),
    };
}

function authorIds(routes: readonly PlanningRoute[]): string[] {
    return routes.filter(route => route.kind === "author").map(route => route.artifactId);
}

describe("createRollingScheduler", () => {
    test("starts empty with full availability and no suspension", () => {
        const scheduler = createRollingScheduler(2);
        expect(scheduler.active).toBe(0);
        expect(scheduler.available).toBe(2);
        expect(scheduler.suspended).toBe(false);
    });
});

describe("rolling refill", () => {
    test("fills a freed slot on the next dispatch after one completion", () => {
        const scheduler = createRollingScheduler(2);
        const status1 = fixture(
            [artifact("alpha", "ready"), artifact("bravo", "ready"), artifact("charlie", "ready")],
            ["alpha", "bravo", "charlie"],
            false,
        );
        expect(authorIds(scheduler.dispatch(status1))).toEqual(["alpha", "bravo"]);
        expect(scheduler.active).toBe(2);

        expect(scheduler.complete("alpha")).toBe(true);
        expect(scheduler.active).toBe(1);
        expect(scheduler.available).toBe(1);

        const status2 = fixture(
            [artifact("alpha", "done"), artifact("bravo", "done"), artifact("charlie", "ready")],
            ["alpha", "bravo", "charlie"],
            false,
        );
        expect(authorIds(scheduler.dispatch(status2))).toEqual(["charlie"]);
        expect(scheduler.active).toBe(2);
    });

    test("returns no routes while every slot is occupied", () => {
        const scheduler = createRollingScheduler(2);
        const status = fixture(
            [artifact("alpha", "ready"), artifact("bravo", "ready"), artifact("charlie", "ready")],
            ["alpha", "bravo", "charlie"],
            false,
        );
        expect(authorIds(scheduler.dispatch(status))).toEqual(["alpha", "bravo"]);
        expect(scheduler.dispatch(status)).toEqual([]);
    });

    test("passes plan-ready and blocked routes through when slots remain", () => {
        const scheduler = createRollingScheduler(2);
        const planReady = fixture([artifact("proposal", "done")], ["proposal"], true);
        expect(scheduler.dispatch(planReady)).toEqual([{ kind: "plan-ready" }]);
        expect(scheduler.active).toBe(0);

        const blocked = fixture([artifact("proposal", "done")], ["proposal"], false);
        expect(scheduler.dispatch(blocked)).toEqual([
            { kind: "blocked", reason: "isPlanningComplete false with closure satisfied" },
        ]);
        expect(scheduler.active).toBe(0);
    });
});

describe("serial coordination", () => {
    test("is strictly serial at maxConcurrency 1", () => {
        const scheduler = createRollingScheduler(1);
        const status = fixture(
            [artifact("alpha", "ready"), artifact("bravo", "ready")],
            ["alpha", "bravo"],
            false,
        );
        expect(authorIds(scheduler.dispatch(status))).toEqual(["alpha"]);
        expect(scheduler.dispatch(status)).toEqual([]);
        expect(scheduler.complete("alpha")).toBe(true);

        // A fresh status marks the completed route done before refilling.
        const statusAfter = fixture(
            [artifact("alpha", "done"), artifact("bravo", "ready")],
            ["alpha", "bravo"],
            false,
        );
        expect(authorIds(scheduler.dispatch(statusAfter))).toEqual(["bravo"]);
    });

    test("never exceeds the configured cap", () => {
        const scheduler = createRollingScheduler(2);
        const status = fixture(
            [
                artifact("alpha", "ready"),
                artifact("bravo", "ready"),
                artifact("charlie", "ready"),
                artifact("delta", "ready"),
            ],
            ["alpha", "bravo", "charlie", "delta"],
            false,
        );
        expect(authorIds(scheduler.dispatch(status))).toEqual(["alpha", "bravo"]);
        expect(scheduler.active).toBeLessThanOrEqual(2);
        expect(scheduler.complete("alpha")).toBe(true);
        expect(scheduler.active).toBe(1);

        // A fresh status prevents the completed route from being re-routed.
        const statusAfter = fixture(
            [
                artifact("alpha", "done"),
                artifact("bravo", "done"),
                artifact("charlie", "ready"),
                artifact("delta", "ready"),
            ],
            ["alpha", "bravo", "charlie", "delta"],
            false,
        );
        expect(authorIds(scheduler.dispatch(statusAfter))).toEqual(["charlie"]);
        expect(scheduler.active).toBeLessThanOrEqual(2);
    });
});

describe("fresh-status gating", () => {
    test("evaluates each dispatch against the supplied status only", () => {
        const scheduler = createRollingScheduler(2);
        const blocked = fixture(
            [artifact("X", "blocked", ["Y"]), artifact("Y", "ready")],
            ["X", "Y"],
            false,
        );
        // X is blocked by unfinished Y; Y is the only feasible author route.
        expect(authorIds(scheduler.dispatch(blocked))).toEqual(["Y"]);
        scheduler.complete("Y");

        const unblocked = fixture(
            [artifact("X", "ready", ["Y"]), artifact("Y", "done")],
            ["X", "Y"],
            false,
        );
        expect(authorIds(scheduler.dispatch(unblocked))).toEqual(["X"]);
    });
});

describe("per-completion handoff gate", () => {
    test("releases exactly one slot per completion", () => {
        const scheduler = createRollingScheduler(2);
        const status = fixture(
            [artifact("A", "ready"), artifact("B", "ready"), artifact("C", "ready")],
            ["A", "B", "C"],
            false,
        );
        expect(authorIds(scheduler.dispatch(status))).toEqual(["A", "B"]);
        expect(scheduler.complete("A")).toBe(true);
        expect(scheduler.available).toBe(1);

        // New dispatch is evaluated against fresh status — C is feasible.
        const statusAfter = fixture(
            [artifact("A", "done"), artifact("B", "ready"), artifact("C", "ready")],
            ["A", "B", "C"],
            false,
        );
        expect(authorIds(scheduler.dispatch(statusAfter)).length).toBeLessThanOrEqual(1);
    });

    test("returns no new routes before a completion", () => {
        const scheduler = createRollingScheduler(2);
        const status1 = fixture(
            [artifact("A", "ready"), artifact("B", "ready"), artifact("C", "blocked")],
            ["A", "B", "C"],
            false,
        );
        expect(authorIds(scheduler.dispatch(status1))).toEqual(["A", "B"]);

        const status2 = fixture(
            [artifact("A", "ready"), artifact("B", "ready"), artifact("C", "ready")],
            ["A", "B", "C"],
            false,
        );
        expect(scheduler.dispatch(status2)).toEqual([]);
        expect(scheduler.complete("A")).toBe(true);
        expect(authorIds(scheduler.dispatch(status2))).toHaveLength(1);
    });
});

describe("dependency isolation", () => {
    test("never returns a dependent in the same dispatch as its dependency", () => {
        const scheduler = createRollingScheduler(2);
        const status = fixture(
            [artifact("A", "ready"), artifact("B", "ready", ["A"])],
            ["A", "B"],
            false,
        );
        const routes = authorIds(scheduler.dispatch(status));
        expect(routes).toContain("A");
        expect(routes).not.toContain("B");
    });
});

describe("serial-condition suspension", () => {
    test("halts new dispatches while preserving active siblings", () => {
        const scheduler = createRollingScheduler(2);
        const status = fixture(
            [artifact("A", "ready"), artifact("B", "ready"), artifact("C", "ready")],
            ["A", "B", "C"],
            false,
        );
        expect(authorIds(scheduler.dispatch(status))).toEqual(["A", "B"]);
        scheduler.suspend();
        expect(scheduler.suspended).toBe(true);
        expect(scheduler.dispatch(status)).toEqual([]);
        expect(scheduler.active).toBe(2); // active siblings preserved
    });

    test("still honours complete while suspended", () => {
        const scheduler = createRollingScheduler(2);
        const status = fixture([artifact("A", "ready"), artifact("B", "ready")], ["A", "B"], false);
        scheduler.dispatch(status);
        scheduler.suspend();
        expect(scheduler.complete("A")).toBe(true);
        expect(scheduler.active).toBe(1);
    });

    test("resume restores rolling dispatch from fresh status", () => {
        const scheduler = createRollingScheduler(2);
        const status1 = fixture(
            [artifact("A", "ready"), artifact("B", "ready"), artifact("C", "ready")],
            ["A", "B", "C"],
            false,
        );
        scheduler.dispatch(status1);
        scheduler.suspend();
        scheduler.complete("A");
        scheduler.complete("B");
        scheduler.resume();
        const status2 = fixture(
            [artifact("A", "done"), artifact("B", "done"), artifact("C", "ready")],
            ["A", "B", "C"],
            false,
        );
        expect(authorIds(scheduler.dispatch(status2))).toEqual(["C"]);
    });
});

describe("sibling preservation", () => {
    test("completes siblings independently", () => {
        const scheduler = createRollingScheduler(2);
        const status = fixture([artifact("A", "ready"), artifact("B", "ready")], ["A", "B"], false);
        expect(authorIds(scheduler.dispatch(status))).toEqual(["A", "B"]);
        expect(scheduler.complete("A")).toBe(true);
        expect(scheduler.active).toBe(1);
        expect(scheduler.complete("B")).toBe(true);
        expect(scheduler.active).toBe(0);
    });

    test("complete is idempotent and safe on unknown ids", () => {
        const scheduler = createRollingScheduler(2);
        const status = fixture([artifact("A", "ready"), artifact("B", "ready")], ["A", "B"], false);
        scheduler.dispatch(status);
        expect(scheduler.complete("A")).toBe(true);
        expect(scheduler.active).toBe(1);
        expect(scheduler.complete("A")).toBe(false); // idempotent
        expect(scheduler.active).toBe(1);
        expect(scheduler.complete("unknown")).toBe(false);
        expect(scheduler.active).toBe(1);
    });
});

describe("reconciliation", () => {
    test("shares capacity across independent revisions", () => {
        const scheduler = createRollingScheduler(2);
        const status = {
            ...fixture(
                [
                    artifact("changed-a", "ready"),
                    artifact("changed-b", "ready"),
                    artifact("changed-c", "ready", ["changed-a"]),
                ],
                ["changed-a", "changed-b", "changed-c"],
                false,
            ),
            schemaName: "reconciliation",
        };
        expect(authorIds(scheduler.dispatch(status))).toEqual(["changed-a", "changed-b"]);
        expect(scheduler.active).toBe(2);
    });

    test("keeps dependent revisions ordered by closure", () => {
        const scheduler = createRollingScheduler(2);
        const status = {
            ...fixture(
                [
                    artifact("revision-one", "ready"),
                    artifact("revision-two", "ready", ["revision-one"]),
                ],
                ["revision-one", "revision-two"],
                false,
            ),
            schemaName: "reconciliation",
        };
        expect(authorIds(scheduler.dispatch(status))).toEqual(["revision-one"]);
    });
});
