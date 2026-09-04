import { describe, expect, test } from "bun:test";
import {
    buildTodoProjection,
    type TodoProjectionEntry,
} from "../../src/coordinator/todo-projection.js";
import type { ReviewFanoutProgress } from "../../src/coordinator/review-fanout.js";
import type { NormalizedApplyInstructionContext } from "../../src/openspec/apply-instructions.js";
import type { NormalizedArtifact, NormalizedStatus } from "../../src/openspec/status.js";

function artifact(
    id: string,
    status: NormalizedArtifact["status"],
    requires: readonly string[] = [],
): NormalizedArtifact {
    return { id, outputPath: `openspec/changes/example/${id}.md`, status, requires };
}

/** An apply context with 12 tasks and `complete` of them checked. */
function applyContext(
    complete = 0,
    state: NormalizedApplyInstructionContext["state"] = "ready",
): NormalizedApplyInstructionContext {
    return {
        changeName: "example",
        changeDir: "openspec/changes/example",
        schemaName: "spec-driven",
        contextFiles: {},
        progress: { total: 12, complete, remaining: 12 - complete },
        tasks: [],
        state,
        instruction: "",
    };
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
            "Author proposal — define the change's purpose and scope",
            "Draft specs — write the requirement deltas for the change",
            "Plan tasks — break the work into implementation steps",
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
            "Author proposal — define the change's purpose and scope",
            "Draft specs — write the requirement deltas for the change",
            "Design — decide the technical approach",
            "Plan tasks — break the work into implementation steps",
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
        expect(
            buildTodoProjection(status).some(
                entry => entry.content === "Design — decide the technical approach",
            ),
        ).toBe(false);
    });

    test.each([
        ["done", "complete"],
        ["skipped", "complete"],
        ["ready", "in_progress"],
        ["blocked", "in_progress"],
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
                id: "planning:proposal",
                content: "Author proposal — define the change's purpose and scope",
                status: "in_progress",
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
            content: "Author proposal — define the change's purpose and scope",
            status: "in_progress",
            owner: "specops-planner",
        });
    });

    test("omits the approval checkpoint in autonomous mode", () => {
        const status = fixture([artifact("proposal", "done")], ["proposal"]);

        expect(buildTodoProjection(status, "auto").map(entry => entry.content)).toEqual([
            "Author proposal — define the change's purpose and scope",
            "Implementation — build the approved tasks",
            "Independent review — verify against specs and design",
            "Remediate findings — fix what review flagged",
            "Re-review — confirm the fixes hold",
            "Complete change — archive or remediate",
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

describe("buildTodoProjection lifecycle advancement", () => {
    const complete = fixture(
        [artifact("proposal", "done"), artifact("tasks", "done", ["proposal"])],
        ["tasks"],
        true,
    );

    function stageStatuses(entries: readonly TodoProjectionEntry[]): Map<string, string> {
        return new Map(
            entries
                .filter(entry => !entry.id.startsWith("planning:"))
                .map(entry => [entry.id, entry.status]),
        );
    }

    test("without an apply context every stage stays pending and the fixup marks approval", () => {
        const statuses = stageStatuses(buildTodoProjection(complete));

        expect(statuses.get("plan-approval")).toBe("in_progress");
        expect(statuses.get("implementation")).toBe("pending");
        expect(statuses.get("independent-review")).toBe("pending");
        expect(statuses.get("lifecycle-remediation")).toBe("pending");
    });

    test("a blocked apply state keeps the approval checkpoint current", () => {
        const statuses = stageStatuses(
            buildTodoProjection(complete, "interactive", undefined, {
                apply: applyContext(0, "blocked"),
            }),
        );

        expect(statuses.get("plan-approval")).toBe("in_progress");
        expect(statuses.get("implementation")).toBe("pending");
    });

    test("implementation-phase without start keeps the approval checkpoint current", () => {
        const statuses = stageStatuses(
            buildTodoProjection(complete, "interactive", undefined, {
                apply: applyContext(0),
            }),
        );

        expect(statuses.get("plan-approval")).toBe("in_progress");
        expect(statuses.get("implementation")).toBe("pending");
    });

    test("implementation-phase with a checked task completes approval and starts implementation", () => {
        const statuses = stageStatuses(
            buildTodoProjection(complete, "interactive", undefined, {
                apply: applyContext(4),
            }),
        );

        expect(statuses.get("plan-approval")).toBe("complete");
        expect(statuses.get("implementation")).toBe("in_progress");
        expect(statuses.get("independent-review")).toBe("pending");
        expect(statuses.get("lifecycle-remediation")).toBe("pending");
    });

    test("the observed entry gate starts implementation before any checkbox", () => {
        const statuses = stageStatuses(
            buildTodoProjection(complete, "interactive", undefined, {
                apply: applyContext(0),
                implementationEntered: true,
            }),
        );

        expect(statuses.get("plan-approval")).toBe("complete");
        expect(statuses.get("implementation")).toBe("in_progress");
    });

    test("review-phase completes implementation and starts independent review", () => {
        const statuses = stageStatuses(
            buildTodoProjection(complete, "interactive", undefined, {
                apply: applyContext(12, "all_done"),
            }),
        );

        expect(statuses.get("plan-approval")).toBe("complete");
        expect(statuses.get("implementation")).toBe("complete");
        expect(statuses.get("independent-review")).toBe("in_progress");
        expect(statuses.get("lifecycle-remediation")).toBe("pending");
    });

    test("auto mode advances identically minus the skipped approval checkpoint", () => {
        const statuses = stageStatuses(
            buildTodoProjection(complete, "auto", undefined, { apply: applyContext(2) }),
        );

        expect(statuses.has("plan-approval")).toBe(false);
        expect(statuses.get("implementation")).toBe("in_progress");
        expect(statuses.get("independent-review")).toBe("pending");
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

        expect(buildTodoProjection(status, "interactive")).toEqual(
            buildTodoProjection(status, "interactive", undefined),
        );
        expect(buildTodoProjection(status, "auto")).toEqual(
            buildTodoProjection(status, "auto", undefined),
        );
    });

    test("emits in-flight and completed critics and skips pending and failed", () => {
        const status = fixture([artifact("proposal", "ready")], ["proposal"]);
        const entries = buildTodoProjection(status, "interactive", {
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

        const failedEntries = buildTodoProjection(status, "interactive", {
            reviewFanout: failedFanout,
        });
        expect(failedEntries.some(entry => entry.id.startsWith("review-critic:"))).toBe(false);
    });

    test("maps implementer dispatch states and falls back to positional ids", () => {
        const status = fixture([artifact("proposal", "ready")], ["proposal"]);
        const entries = buildTodoProjection(status, "interactive", {
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
        const entries = buildTodoProjection(status, "interactive", {
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
        const entries = buildTodoProjection(status, "interactive", {
            reviewFanout: fanoutProgress,
            implementerDispatches: [{ dispatchId: "impl-1", state: "inFlight" }],
        });

        // Serial prefix is untouched: the fixup marks the first planning
        // artifact as current work.
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
