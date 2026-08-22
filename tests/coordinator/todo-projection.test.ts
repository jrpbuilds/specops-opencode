import { describe, expect, test } from "bun:test";
import {
    buildTodoProjection,
    type TodoProjectionEntry,
} from "../../src/coordinator/todo-projection.js";
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
            "Lifecycle/remediation",
        ]);
    });
});
