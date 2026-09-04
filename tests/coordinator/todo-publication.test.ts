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
                content: "Author proposal — define the change's purpose and scope",
                status: "completed",
                priority: "medium",
            },
            {
                id: "planning:tasks",
                content: "Plan tasks — break the work into implementation steps",
                status: "in_progress",
                priority: "medium",
            },
        ]);
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

    test("forwards the lifecycle input so post-plan stages advance natively", () => {
        const items = buildNativeTodoProjection(statusFixture(), "interactive", {
            apply: {
                changeName: "example",
                changeDir: "openspec/changes/example",
                schemaName: "spec-driven",
                contextFiles: {},
                progress: { total: 12, complete: 5, remaining: 7 },
                tasks: [],
                state: "ready",
                instruction: "",
            },
        });
        const byId = new Map(items.map(item => [item.id, item]));

        expect(byId.get("plan-approval")?.status).toBe("completed");
        expect(byId.get("implementation")?.status).toBe("in_progress");
        expect(byId.get("implementation")?.priority).toBe("medium");
    });
});
