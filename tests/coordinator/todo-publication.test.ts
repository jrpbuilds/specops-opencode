import { describe, expect, test } from "bun:test";
import { buildNativeTodoProjection } from "../../src/coordinator/todo-publication.js";
import type { NormalizedArtifact, NormalizedStatus } from "../../src/openspec/status.js";

function artifact(
    id: string,
    status: NormalizedArtifact["status"],
    requires: readonly string[] = [],
): NormalizedArtifact {
    return { id, outputPath: `openspec/changes/example/${id}.md`, status, requires };
}

function statusFixture(overrides: Partial<NormalizedStatus> = {}): NormalizedStatus {
    return {
        changeName: "example",
        schemaName: "spec-driven",
        isPlanningComplete: true,
        applyRequires: ["proposal", "tasks"],
        artifacts: [artifact("proposal", "done"), artifact("tasks", "done", ["proposal"])],
        ...overrides,
    };
}

describe("buildNativeTodoProjection", () => {
    test("maps projection statuses onto the native vocabulary with uniform priority", () => {
        const items = buildNativeTodoProjection(
            statusFixture({
                artifacts: [artifact("proposal", "done"), artifact("tasks", "ready", ["proposal"])],
            }),
        );

        expect(items).toEqual([
            {
                id: "planning:proposal",
                content: "proposal",
                status: "completed",
                priority: "medium",
            },
            { id: "planning:tasks", content: "tasks", status: "in_progress", priority: "medium" },
        ]);
    });

    test("always omits the Explorer evidence entry", () => {
        const items = buildNativeTodoProjection(
            statusFixture({
                artifacts: [artifact("proposal", "ready")],
            }),
        );

        expect(items.map(item => item.id)).not.toContain("repository-evidence");
    });

    test("appends the fixed stages once planning is complete in interactive mode", () => {
        const items = buildNativeTodoProjection(statusFixture());

        expect(items.map(item => item.id)).toEqual([
            "planning:proposal",
            "planning:tasks",
            "plan-approval",
            "implementation",
            "independent-review",
            "lifecycle-remediation",
        ]);
    });

    test("auto mode adds the auto review stages and drops the approval checkpoint", () => {
        const items = buildNativeTodoProjection(statusFixture(), "auto");

        expect(items.map(item => item.id)).toEqual([
            "planning:proposal",
            "planning:tasks",
            "implementation",
            "independent-review",
            "auto-review-remediation",
            "auto-review-re-review",
            "lifecycle-remediation",
        ]);
    });

    test("keeps custom schema artifact ids graph-driven", () => {
        const items = buildNativeTodoProjection(
            statusFixture({
                applyRequires: ["proposal", "research"],
                artifacts: [artifact("proposal", "done"), artifact("research", "ready")],
            }),
        );

        expect(items.map(item => item.id)).toEqual(["planning:proposal", "planning:research"]);
        expect(items[1]).toEqual({
            id: "planning:research",
            content: "research",
            status: "in_progress",
            priority: "medium",
        });
    });
});
