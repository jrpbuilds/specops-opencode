import { describe, expect, test } from "bun:test";
import { nextBatch, type PlanningRoute } from "../../src/coordinator/batching.js";
import { buildTodoProjection } from "../../src/coordinator/todo-projection.js";
import { derivePlanningCompletion } from "../../src/coordinator/planning-completion.js";
import {
    deriveEligibleActions,
    deriveWorkflowState,
} from "../../src/coordinator/workflow-state.js";
import type { NormalizedApplyInstructionContext } from "../../src/openspec/apply-instructions.js";
import type { NormalizedStatus } from "../../src/openspec/status.js";

function statusFixture(overrides: Partial<NormalizedStatus> = {}): NormalizedStatus {
    return {
        changeName: "example",
        schemaName: "spec-driven",
        isPlanningComplete: true,
        applyRequires: ["proposal", "tasks"],
        artifacts: [
            {
                id: "proposal",
                outputPath: "openspec/changes/example/proposal.md",
                status: "done",
                requires: [],
            },
            {
                id: "tasks",
                outputPath: "openspec/changes/example/tasks.md",
                status: "done",
                requires: ["proposal"],
            },
        ],
        ...overrides,
    };
}

function applyFixture(
    overrides: Partial<NormalizedApplyInstructionContext> = {},
): NormalizedApplyInstructionContext {
    return {
        changeName: "example",
        changeDir: "openspec/changes/example",
        schemaName: "spec-driven",
        contextFiles: { proposal: ["openspec/changes/example/proposal.md"] },
        progress: { total: 2, complete: 2, remaining: 0 },
        tasks: [
            { id: "1.1", description: "First task", done: true },
            { id: "1.2", description: "Second task", done: true },
        ],
        state: "all_done",
        instruction: "All tasks are complete!",
        ...overrides,
    };
}

const applyRemaining = applyFixture({
    state: "ready",
    progress: { total: 2, complete: 1, remaining: 1 },
    tasks: [
        { id: "1.1", description: "First task", done: true },
        { id: "1.2", description: "Second task", done: false },
    ],
});

const applyUntracked = applyFixture({
    state: "ready",
    progress: { total: 0, complete: 0, remaining: 0 },
    tasks: [],
    instruction: "All required artifacts complete. Proceed with implementation.",
});

/** Representative durable states spanning planning, implementation, review,
 * and remediation shapes, plus blocked, custom-schema, and deadlock variants. */
const cases: readonly {
    name: string;
    status: NormalizedStatus;
    apply: NormalizedApplyInstructionContext;
}[] = [
    {
        name: "planning with a feasible artifact",
        status: statusFixture({
            isPlanningComplete: false,
            artifacts: [
                {
                    id: "proposal",
                    outputPath: "openspec/changes/example/proposal.md",
                    status: "done",
                    requires: [],
                },
                {
                    id: "tasks",
                    outputPath: "openspec/changes/example/tasks.md",
                    status: "ready",
                    requires: ["proposal"],
                },
            ],
        }),
        apply: applyRemaining,
    },
    {
        name: "planning with an unknown required artifact",
        status: statusFixture({ applyRequires: ["proposal", "tasks", "nonexistent"] }),
        apply: applyRemaining,
    },
    {
        name: "flag-false with a satisfied closure",
        status: statusFixture({ isPlanningComplete: false }),
        apply: applyRemaining,
    },
    {
        name: "implementation with tracked tasks remaining",
        status: statusFixture(),
        apply: applyRemaining,
    },
    {
        name: "review after every task is done",
        status: statusFixture(),
        apply: applyFixture(),
    },
    {
        name: "implementation and review for a schema with no task tracking",
        status: statusFixture(),
        apply: applyUntracked,
    },
    {
        name: "apply flow blocked after planning",
        status: statusFixture(),
        apply: applyFixture({ state: "blocked", missingArtifacts: ["tasks"] }),
    },
    {
        name: "custom schema with a feasible artifact",
        status: statusFixture({
            applyRequires: ["proposal", "research"],
            artifacts: [
                {
                    id: "proposal",
                    outputPath: "openspec/changes/example/proposal.md",
                    status: "done",
                    requires: [],
                },
                {
                    id: "research",
                    outputPath: "openspec/changes/example/research.md",
                    status: "ready",
                    requires: [],
                },
            ],
        }),
        apply: applyRemaining,
    },
    {
        name: "dependency-cycle deadlock with nothing feasible",
        status: statusFixture({
            artifacts: [
                {
                    id: "proposal",
                    outputPath: "openspec/changes/example/proposal.md",
                    status: "ready",
                    requires: ["tasks"],
                },
                {
                    id: "tasks",
                    outputPath: "openspec/changes/example/tasks.md",
                    status: "ready",
                    requires: ["proposal"],
                },
            ],
        }),
        apply: applyRemaining,
    },
];

/** Todo stage ids appended only once planning is complete. */
const POST_PLANNING_STAGE_IDS = new Set([
    "plan-approval",
    "implementation",
    "independent-review",
    "lifecycle-remediation",
]);

function authorIds(routes: readonly PlanningRoute[]): string[] {
    return routes.flatMap(route => (route.kind === "author" ? [route.artifactId] : []));
}

function authorActionIds(status: NormalizedStatus, apply: NormalizedApplyInstructionContext) {
    return deriveEligibleActions(status, apply).flatMap(action =>
        action.type === "author-artifact" ? [action.artifactId] : [],
    );
}

describe("canonical workflow legality", () => {
    test("status, scheduler, Todo projection, and eligible actions agree for every representative state", () => {
        for (const { status, apply } of cases) {
            const completion = derivePlanningCompletion(status);
            const routes = nextBatch(status, 8);
            const actions = deriveEligibleActions(status, apply);
            const state = deriveWorkflowState(status, apply);
            const todo = buildTodoProjection(status);

            // The scheduler's plan-ready route is exactly the canonical
            // planning-complete verdict.
            expect(routes.some(route => route.kind === "plan-ready")).toBe(completion.complete);

            // The Todo projection appends post-planning stages exactly when
            // planning is complete.
            expect(todo.some(entry => POST_PLANNING_STAGE_IDS.has(entry.id))).toBe(
                completion.complete,
            );

            // Author routes and author actions are the same artifacts in the
            // same order.
            expect(authorIds(routes)).toEqual(authorActionIds(status, apply));

            // Lifecycle legality mirrors the canonical verdict.
            if (!completion.complete) {
                const expected =
                    completion.reason === "unknown-required"
                        ? "planning-blocked"
                        : "planning-incomplete";
                expect(state.phase).toBe("planning");
                expect(state.lifecycle.implement).toEqual({ allowed: false, reason: expected });
                expect(state.lifecycle.review).toEqual({ allowed: false, reason: expected });
            } else if (apply.state === "blocked") {
                expect(state.phase).toBe("planning");
                expect(state.lifecycle.implement).toEqual({
                    allowed: false,
                    reason: "apply-blocked",
                });
                expect(state.lifecycle.review).toEqual({
                    allowed: false,
                    reason: "apply-blocked",
                });
            } else {
                expect(["implementation", "review"]).toContain(state.phase);
            }

            // Unknown dependencies surface the same ids everywhere.
            if (!completion.complete && completion.reason === "unknown-required") {
                const blockedRoute = routes.find(route => route.kind === "blocked");
                expect(blockedRoute).toEqual({
                    kind: "blocked",
                    reason: `Unknown required artifact id(s): ${completion.unknownRequired.join(", ")}`,
                    unknownRequired: completion.unknownRequired,
                });
            }

            // Archive is never presented as a legal action, whatever the
            // structural OpenSpec readiness is.
            expect(actions.map(action => action.type)).not.toContain("archive");
        }
    });

    test("status lifecycle and scheduler agree at every boundary of the matrix", () => {
        for (const { status, apply } of cases) {
            const state = deriveWorkflowState(status, apply);
            const actions = deriveEligibleActions(status, apply);
            const actionTypes = actions.map(action => action.type);
            const implementAction =
                actionTypes.includes("enter-implementation") || actionTypes.includes("remediate");

            expect(state.lifecycle.implement.allowed).toBe(implementAction);
            expect(state.lifecycle.review.allowed).toBe(actionTypes.includes("enter-review"));
        }
    });
});
