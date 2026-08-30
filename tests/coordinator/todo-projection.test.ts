import { describe, expect, test } from "bun:test";
import {
    buildTodoProjection,
    type TodoProjectionEntry,
} from "../../src/coordinator/todo-projection.js";
import type { ReviewFanoutProgress } from "../../src/coordinator/review-fanout.js";
import type { NormalizedArtifact, NormalizedStatus } from "../../src/openspec/status.js";

function artifact(
    id: string,
    status: NormalizedArtifact["status"],
    requires: readonly string[] = [],
): NormalizedArtifact {
    return { id, outputPath: `openspec/changes/example/${id}.md`, status, requires };
}

function fixture(
    artifacts: readonly NormalizedArtifact[],
    applyRequires: readonly string[],
    isPlanningComplete?: boolean,
): NormalizedStatus {
    return {
        changeName: "example",
        schemaName: "spec-driven",
        artifacts,
        applyRequires,
        ...(isPlanningComplete === undefined ? {} : { isPlanningComplete }),
    };
}

function planningEntries(entries: readonly TodoProjectionEntry[]): TodoProjectionEntry[] {
    return entries.filter(entry => entry.id.startsWith("planning:"));
}

describe("buildTodoProjection", () => {
    test("prepends in-progress repository evidence while planning is in progress", () => {
        const entries = buildTodoProjection(fixture([artifact("proposal", "ready")], ["proposal"]));

        expect(entries[0]).toEqual({
            id: "repository-evidence",
            content: "Repository evidence",
            status: "in_progress",
            owner: "specops-explorer",
        });
    });

    test("keeps repository evidence pending after planning is complete", () => {
        const entries = buildTodoProjection(fixture([artifact("proposal", "done")], ["proposal"]));

        expect(entries[0]).toEqual({
            id: "repository-evidence",
            content: "Repository evidence",
            status: "pending",
            owner: "specops-explorer",
        });
    });

    test("emits default-schema planning artifacts in dependency order", () => {
        const status = fixture(
            [
                artifact("tasks", "ready", ["specs"]),
                artifact("proposal", "done"),
                artifact("specs", "done", ["proposal"]),
            ],
            ["tasks"],
        );

        expect(planningEntries(buildTodoProjection(status)).map(entry => entry.content)).toEqual([
            "proposal",
            "specs",
            "tasks",
        ]);
        expect(planningEntries(buildTodoProjection(status)).map(entry => entry.owner)).toEqual([
            "specops-planner",
            "specops-planner",
            "specops-planner",
        ]);
    });

    test("places a declared design artifact between specs and tasks", () => {
        const status = fixture(
            [
                artifact("tasks", "ready", ["design"]),
                artifact("design", "ready", ["specs"]),
                artifact("proposal", "done"),
                artifact("specs", "done", ["proposal"]),
            ],
            ["tasks"],
        );

        expect(planningEntries(buildTodoProjection(status)).map(entry => entry.content)).toEqual([
            "proposal",
            "specs",
            "design",
            "tasks",
        ]);
        expect(planningEntries(buildTodoProjection(status))[2]?.owner).toBe("specops-designer");
    });

    test("honors custom artifact ids and omits undeclared planning artifacts", () => {
        const status = fixture(
            [
                artifact("release-notes", "ready", ["requirements"]),
                artifact("requirements", "done"),
                artifact("unrelated", "ready"),
            ],
            ["release-notes"],
        );

        expect(planningEntries(buildTodoProjection(status)).map(entry => entry.content)).toEqual([
            "requirements",
            "release-notes",
        ]);
        expect(buildTodoProjection(status).some(entry => entry.content === "design")).toBe(false);
    });

    test.each([
        ["done", "complete"],
        ["skipped", "complete"],
        ["ready", "pending"],
        ["blocked", "pending"],
    ] as const)("maps durable %s status to %s or current focus", (durable, projected) => {
        const entries = planningEntries(
            buildTodoProjection(fixture([artifact("proposal", durable)], ["proposal"])),
        );

        expect(entries[0]?.status).toBe(projected);
    });

    test("does not probe capabilities or raise when no native Todo capability exists", () => {
        const status = fixture([artifact("proposal", "ready")], ["proposal"]);

        expect(() => buildTodoProjection(status)).not.toThrow();
        expect(buildTodoProjection(status)).toEqual([
            {
                id: "repository-evidence",
                content: "Repository evidence",
                status: "in_progress",
                owner: "specops-explorer",
            },
            {
                id: "planning:proposal",
                content: "proposal",
                status: "pending",
                owner: "specops-planner",
            },
        ]);
    });

    test("rebuilds from each fresh status snapshot without accumulating prior entries", () => {
        const initial = fixture(
            [artifact("proposal", "ready"), artifact("tasks", "ready", ["proposal"])],
            ["tasks"],
        );
        const resumed = fixture(
            [artifact("proposal", "done"), artifact("tasks", "ready", ["proposal"])],
            ["tasks"],
        );

        const firstProjection = buildTodoProjection(initial);
        const resumedProjection = buildTodoProjection(resumed);

        expect(firstProjection).not.toEqual(resumedProjection);
        expect(resumedProjection).toEqual(buildTodoProjection(resumed));
        expect(resumedProjection).not.toContainEqual({
            id: "planning:proposal",
            content: "proposal",
            status: "in_progress",
            owner: "specops-planner",
        });
    });

    test("omits the approval checkpoint in autonomous mode", () => {
        const status = fixture([artifact("proposal", "done")], ["proposal"]);

        expect(buildTodoProjection(status, "auto").map(entry => entry.content)).toEqual([
            "Repository evidence",
            "proposal",
            "Implementation",
            "Independent review",
            "Auto review remediation",
            "Auto review re-review",
            "Lifecycle/remediation",
        ]);
    });

    test("keeps Auto remediation stages ephemeral and non-authoritative", () => {
        const status = fixture([artifact("proposal", "done")], ["proposal"]);
        const entries = buildTodoProjection(status, "auto");

        expect(entries.map(entry => entry.id)).toContain("auto-review-remediation");
        expect(entries.map(entry => entry.id)).toContain("auto-review-re-review");
        expect(status.artifacts[0]?.status).toBe("done");
    });
});

describe("buildTodoProjection parallel progress", () => {
    const fanoutProgress: ReviewFanoutProgress = {
        critics: [
            { id: "correctness", status: "completed" },
            { id: "risk", status: "inFlight" },
            { id: "quality", status: "pending" },
        ],
        counts: { pending: 1, inFlight: 1, completed: 1, failed: 0 },
    };

    const failedFanout: ReviewFanoutProgress = {
        critics: [{ id: "risk", status: "failed" }],
        counts: { pending: 0, inFlight: 0, completed: 0, failed: 1 },
    };

    test("omitting the parallel input reproduces the projection exactly as before", () => {
        const status = fixture([artifact("proposal", "done")], ["proposal"]);

        expect(buildTodoProjection(status, "interactive", true)).toEqual(
            buildTodoProjection(status, "interactive", true, undefined),
        );
        expect(buildTodoProjection(status, "auto", false)).toEqual(
            buildTodoProjection(status, "auto", false, undefined),
        );
    });

    test("emits in-flight and completed critics and skips pending and failed", () => {
        const status = fixture([artifact("proposal", "ready")], ["proposal"]);
        const entries = buildTodoProjection(status, "interactive", true, {
            reviewFanout: fanoutProgress,
        });
        const criticEntries = entries.filter(entry => entry.id.startsWith("review-critic:"));

        expect(criticEntries).toEqual([
            {
                id: "review-critic:correctness",
                content: "Review critic: correctness",
                status: "complete",
            },
            { id: "review-critic:risk", content: "Review critic: risk", status: "in_progress" },
        ]);
        expect(entries.some(entry => entry.id === "review-critic:quality")).toBe(false);

        const failedEntries = buildTodoProjection(status, "interactive", true, {
            reviewFanout: failedFanout,
        });
        expect(failedEntries.some(entry => entry.id.startsWith("review-critic:"))).toBe(false);
    });

    test("maps implementer dispatch states and falls back to positional ids", () => {
        const status = fixture([artifact("proposal", "ready")], ["proposal"]);
        const entries = buildTodoProjection(status, "interactive", true, {
            implementerDispatches: [
                { dispatchId: "impl-1", state: "inFlight" },
                { state: "completed" },
                { state: "inFlight" },
            ],
        });
        const dispatchEntries = entries.filter(entry => entry.id.startsWith("implementer:"));

        expect(dispatchEntries).toEqual([
            {
                id: "implementer:impl-1",
                content: "Implementer dispatch impl-1",
                status: "in_progress",
            },
            { id: "implementer:#2", content: "Implementer dispatch #2", status: "complete" },
            { id: "implementer:#3", content: "Implementer dispatch #3", status: "in_progress" },
        ]);
    });

    test("falls back to a positional id for a dispatchId-less dispatch", () => {
        const status = fixture([artifact("proposal", "ready")], ["proposal"]);
        const entries = buildTodoProjection(status, "interactive", true, {
            implementerDispatches: [{ state: "inFlight" }],
        });

        expect(entries[entries.length - 1]).toEqual({
            id: "implementer:#1",
            content: "Implementer dispatch #1",
            status: "in_progress",
        });
    });

    test("appends parallel entries after the firstIncomplete fixup without disturbing it", () => {
        const status = fixture([artifact("proposal", "ready")], ["proposal"]);
        const baseline = buildTodoProjection(status);
        const entries = buildTodoProjection(status, "interactive", true, {
            reviewFanout: fanoutProgress,
            implementerDispatches: [{ dispatchId: "impl-1", state: "inFlight" }],
        });

        // Serial prefix is untouched: repository evidence still holds the
        // firstIncomplete in_progress marking and planning stays pending.
        expect(entries.slice(0, baseline.length)).toEqual(baseline);
        expect(entries[0]?.status).toBe("in_progress");
        // Parallel entries are appended last with their explicit statuses.
        expect(entries.slice(baseline.length)).toEqual([
            {
                id: "review-critic:correctness",
                content: "Review critic: correctness",
                status: "complete",
            },
            { id: "review-critic:risk", content: "Review critic: risk", status: "in_progress" },
            {
                id: "implementer:impl-1",
                content: "Implementer dispatch impl-1",
                status: "in_progress",
            },
        ]);
    });
});
