import { describe, expect, test } from "bun:test";
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

describe("deriveWorkflowState", () => {
    test("reports planning with both capabilities blocked while the closure is unsatisfied", () => {
        const state = deriveWorkflowState(
            statusFixture({
                artifacts: [
                    {
                        id: "proposal",
                        outputPath: "openspec/changes/example/proposal.md",
                        status: "ready",
                        requires: [],
                    },
                    {
                        id: "tasks",
                        outputPath: "openspec/changes/example/tasks.md",
                        status: "blocked",
                        requires: ["proposal"],
                        missingDeps: [],
                    },
                ],
            }),
            applyFixture({ state: "blocked", missingArtifacts: ["proposal"] }),
        );

        expect(state).toEqual({
            phase: "planning",
            lifecycle: {
                implement: { allowed: false, reason: "planning-incomplete" },
                review: { allowed: false, reason: "planning-incomplete" },
            },
        });
    });

    test("reports planning when OpenSpec marks planning incomplete with a satisfied closure", () => {
        const state = deriveWorkflowState(
            statusFixture({ isPlanningComplete: false }),
            applyFixture(),
        );

        expect(state.phase).toBe("planning");
        expect(state.lifecycle.implement).toEqual({
            allowed: false,
            reason: "planning-incomplete",
        });
        expect(state.lifecycle.review).toEqual({
            allowed: false,
            reason: "planning-incomplete",
        });
    });

    test("treats an absent isPlanningComplete flag as planning complete", () => {
        const state = deriveWorkflowState(
            { ...statusFixture(), isPlanningComplete: undefined },
            applyFixture(),
        );

        expect(state.phase).toBe("review");
        expect(state.lifecycle).toEqual({
            implement: { allowed: true },
            review: { allowed: true },
        });
    });

    test("blocks planning with a stable reason when applyRequires references an unknown artifact", () => {
        const state = deriveWorkflowState(
            statusFixture({ applyRequires: ["proposal", "tasks", "nonexistent"] }),
            applyFixture(),
        );

        expect(state).toEqual({
            phase: "planning",
            lifecycle: {
                implement: { allowed: false, reason: "planning-blocked" },
                review: { allowed: false, reason: "planning-blocked" },
            },
        });
    });

    test("blocks planning when an artifact edge references an unknown artifact", () => {
        const state = deriveWorkflowState(
            statusFixture({
                artifacts: [
                    {
                        id: "proposal",
                        outputPath: "openspec/changes/example/proposal.md",
                        status: "done",
                        requires: ["ghost"],
                    },
                    {
                        id: "tasks",
                        outputPath: "openspec/changes/example/tasks.md",
                        status: "done",
                        requires: ["proposal"],
                    },
                ],
            }),
            applyFixture(),
        );

        expect(state.lifecycle.implement).toEqual({ allowed: false, reason: "planning-blocked" });
    });

    test("treats skipped artifacts as satisfying the closure", () => {
        const state = deriveWorkflowState(
            statusFixture({
                artifacts: [
                    {
                        id: "proposal",
                        outputPath: "openspec/changes/example/proposal.md",
                        status: "skipped",
                        requires: [],
                    },
                    {
                        id: "tasks",
                        outputPath: "openspec/changes/example/tasks.md",
                        status: "done",
                        requires: ["proposal"],
                    },
                ],
            }),
            applyFixture(),
        );

        expect(state.phase).toBe("review");
        expect(state.lifecycle.review).toEqual({ allowed: true });
    });

    test("fails closed as planning when apply is blocked with planning complete", () => {
        const state = deriveWorkflowState(statusFixture(), applyFixture({ state: "blocked" }));

        expect(state.phase).toBe("planning");
        expect(state.lifecycle.implement).toEqual({ allowed: false, reason: "apply-blocked" });
        expect(state.lifecycle.review).toEqual({ allowed: false, reason: "apply-blocked" });
    });

    test("reports implementation with unchecked tracked tasks and review unavailable", () => {
        const state = deriveWorkflowState(
            statusFixture(),
            applyFixture({
                state: "ready",
                progress: { total: 2, complete: 1, remaining: 1 },
                tasks: [
                    { id: "1.1", description: "First task", done: true },
                    { id: "1.2", description: "Second task", done: false },
                ],
                instruction: "Work through pending tasks.",
            }),
        );

        expect(state.phase).toBe("implementation");
        expect(state.lifecycle.implement).toEqual({ allowed: true });
        expect(state.lifecycle.review).toEqual({
            allowed: false,
            reason: "implementation-incomplete",
        });
    });

    test("reports review with both capabilities allowed once every tracked task is done", () => {
        const state = deriveWorkflowState(statusFixture(), applyFixture());

        expect(state).toEqual({
            phase: "review",
            lifecycle: { implement: { allowed: true }, review: { allowed: true } },
        });
    });

    test("keeps review legal for a schema with no task tracking once planning is complete", () => {
        const state = deriveWorkflowState(
            statusFixture(),
            applyFixture({
                state: "ready",
                progress: { total: 0, complete: 0, remaining: 0 },
                tasks: [],
                instruction: "All required artifacts complete. Proceed with implementation.",
            }),
        );

        expect(state.phase).toBe("implementation");
        expect(state.lifecycle.implement).toEqual({ allowed: true });
        expect(state.lifecycle.review).toEqual({ allowed: true });
    });

    test("routes remediation-shaped partial completion back to the implementation phase", () => {
        // Durable state cannot distinguish remediation from first-pass
        // implementation: unchecked tasks read as implementation either way.
        const state = deriveWorkflowState(
            statusFixture(),
            applyFixture({
                state: "ready",
                progress: { total: 3, complete: 2, remaining: 1 },
                tasks: [
                    { id: "1.1", description: "First task", done: true },
                    { id: "1.2", description: "Second task", done: true },
                    { id: "2.1", description: "Remediation task", done: false },
                ],
            }),
        );

        expect(state.phase).toBe("implementation");
        expect(state.lifecycle.review).toEqual({
            allowed: false,
            reason: "implementation-incomplete",
        });
    });

    test("fails safe to planning when apply reports all_done while planning is incomplete", () => {
        const state = deriveWorkflowState(
            statusFixture({
                artifacts: [
                    {
                        id: "proposal",
                        outputPath: "openspec/changes/example/proposal.md",
                        status: "ready",
                        requires: [],
                    },
                    {
                        id: "tasks",
                        outputPath: "openspec/changes/example/tasks.md",
                        status: "done",
                        requires: ["proposal"],
                    },
                ],
            }),
            applyFixture(),
        );

        expect(state.phase).toBe("planning");
        expect(state.lifecycle.implement).toEqual({
            allowed: false,
            reason: "planning-incomplete",
        });
    });

    test("emits the fixed workflow-state shape", () => {
        const state = deriveWorkflowState(
            statusFixture(),
            applyFixture({
                state: "ready",
                progress: { total: 2, complete: 1, remaining: 1 },
                tasks: [
                    { id: "1.1", description: "First task", done: true },
                    { id: "1.2", description: "Second task", done: false },
                ],
            }),
        );

        expect(state).toEqual({
            phase: "implementation",
            lifecycle: {
                implement: { allowed: true },
                review: { allowed: false, reason: "implementation-incomplete" },
            },
        });
        expect(Object.keys(state)).toEqual(["phase", "lifecycle"]);
        expect(Object.keys(state.lifecycle)).toEqual(["implement", "review"]);
    });
});

describe("deriveEligibleActions", () => {
    test("emits author actions for every feasible planning artifact in schema order", () => {
        const actions = deriveEligibleActions(
            statusFixture({
                applyRequires: ["proposal", "design", "tasks"],
                artifacts: [
                    {
                        id: "design",
                        outputPath: "openspec/changes/example/design.md",
                        status: "ready",
                        requires: ["proposal"],
                    },
                    {
                        id: "tasks",
                        outputPath: "openspec/changes/example/tasks.md",
                        status: "ready",
                        requires: ["proposal"],
                    },
                    {
                        id: "proposal",
                        outputPath: "openspec/changes/example/proposal.md",
                        status: "done",
                        requires: [],
                    },
                ],
            }),
            applyFixture(),
        );

        expect(actions).toEqual([
            { type: "author-artifact", artifactId: "tasks", role: "specops-planner" },
            { type: "author-artifact", artifactId: "design", role: "specops-designer" },
        ]);
    });

    test("emits one author action for a single feasible artifact", () => {
        const actions = deriveEligibleActions(
            statusFixture({
                artifacts: [
                    {
                        id: "proposal",
                        outputPath: "openspec/changes/example/proposal.md",
                        status: "ready",
                        requires: [],
                    },
                    {
                        id: "tasks",
                        outputPath: "openspec/changes/example/tasks.md",
                        status: "done",
                        requires: ["proposal"],
                    },
                ],
            }),
            applyFixture(),
        );

        expect(actions).toEqual([
            { type: "author-artifact", artifactId: "proposal", role: "specops-planner" },
        ]);
    });

    test("emits no actions when a dependency edge references an unknown artifact", () => {
        const actions = deriveEligibleActions(
            statusFixture({ applyRequires: ["proposal", "tasks", "nonexistent"] }),
            applyFixture(),
        );

        expect(actions).toEqual([]);
    });

    test("emits no actions when the apply flow is blocked", () => {
        const actions = deriveEligibleActions(statusFixture(), applyFixture({ state: "blocked" }));

        expect(actions).toEqual([]);
    });

    test("emits no actions when OpenSpec marks planning incomplete with a satisfied closure", () => {
        const actions = deriveEligibleActions(
            statusFixture({ isPlanningComplete: false }),
            applyFixture(),
        );

        expect(actions).toEqual([]);
    });

    test("emits no actions when a dependency cycle leaves nothing feasible", () => {
        const actions = deriveEligibleActions(
            statusFixture({
                applyRequires: ["proposal", "tasks"],
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
            applyFixture(),
        );

        expect(actions).toEqual([]);
    });

    test("emits the implementation action while tracked tasks remain", () => {
        const actions = deriveEligibleActions(
            statusFixture(),
            applyFixture({
                state: "ready",
                progress: { total: 2, complete: 1, remaining: 1 },
                tasks: [
                    { id: "1.1", description: "First task", done: true },
                    { id: "1.2", description: "Second task", done: false },
                ],
            }),
        );

        expect(actions).toEqual([{ type: "enter-implementation" }]);
    });

    test("keeps implementation and review simultaneously eligible for a schema with no task tracking", () => {
        const actions = deriveEligibleActions(
            statusFixture(),
            applyFixture({
                state: "ready",
                progress: { total: 0, complete: 0, remaining: 0 },
                tasks: [],
                instruction: "All required artifacts complete. Proceed with implementation.",
            }),
        );

        expect(actions).toEqual([{ type: "enter-implementation" }, { type: "enter-review" }]);
    });

    test("emits remediation instead of fresh implementation during the review phase", () => {
        const actions = deriveEligibleActions(statusFixture(), applyFixture());

        expect(actions).toEqual([{ type: "remediate" }, { type: "enter-review" }]);
    });

    test("never exposes archive while review success is not durably recorded", () => {
        const actions = deriveEligibleActions(statusFixture(), applyFixture());

        expect(actions.map(action => action.type)).not.toContain("archive");
        expect(actions).toEqual([{ type: "remediate" }, { type: "enter-review" }]);
    });

    test("derives author actions from custom schema artifact ids", () => {
        const actions = deriveEligibleActions(
            statusFixture({
                applyRequires: ["proposal", "architecture"],
                artifacts: [
                    {
                        id: "proposal",
                        outputPath: "openspec/changes/example/proposal.md",
                        status: "done",
                        requires: [],
                    },
                    {
                        id: "architecture",
                        outputPath: "openspec/changes/example/architecture.md",
                        status: "ready",
                        requires: [],
                    },
                ],
            }),
            applyFixture(),
        );

        expect(actions).toEqual([
            { type: "author-artifact", artifactId: "architecture", role: "specops-planner" },
        ]);
    });

    test("treats skipped artifacts as satisfied so dependents become eligible", () => {
        const actions = deriveEligibleActions(
            statusFixture({
                applyRequires: ["proposal", "design"],
                artifacts: [
                    {
                        id: "proposal",
                        outputPath: "openspec/changes/example/proposal.md",
                        status: "skipped",
                        requires: [],
                    },
                    {
                        id: "design",
                        outputPath: "openspec/changes/example/design.md",
                        status: "ready",
                        requires: ["proposal"],
                    },
                ],
            }),
            applyFixture(),
        );

        expect(actions).toEqual([
            { type: "author-artifact", artifactId: "design", role: "specops-designer" },
        ]);
    });

    test("orders author actions identically regardless of artifact listing order", () => {
        const reordered = deriveEligibleActions(
            statusFixture({
                applyRequires: ["proposal", "design", "tasks"],
                artifacts: [
                    {
                        id: "tasks",
                        outputPath: "openspec/changes/example/tasks.md",
                        status: "ready",
                        requires: ["proposal"],
                    },
                    {
                        id: "design",
                        outputPath: "openspec/changes/example/design.md",
                        status: "ready",
                        requires: ["proposal"],
                    },
                    {
                        id: "proposal",
                        outputPath: "openspec/changes/example/proposal.md",
                        status: "done",
                        requires: [],
                    },
                ],
            }),
            applyFixture(),
        );

        expect(reordered).toEqual([
            { type: "author-artifact", artifactId: "tasks", role: "specops-planner" },
            { type: "author-artifact", artifactId: "design", role: "specops-designer" },
        ]);
    });

    test("keeps implementation and review actions in lockstep with lifecycle legality", () => {
        const cases: readonly {
            status: NormalizedStatus;
            apply: NormalizedApplyInstructionContext;
            implement: boolean;
            review: boolean;
        }[] = [
            {
                status: statusFixture({ isPlanningComplete: false }),
                apply: applyFixture(),
                implement: false,
                review: false,
            },
            {
                status: statusFixture(),
                apply: applyFixture({
                    state: "ready",
                    progress: { total: 2, complete: 1, remaining: 1 },
                    tasks: [
                        { id: "1.1", description: "First task", done: true },
                        { id: "1.2", description: "Second task", done: false },
                    ],
                }),
                implement: true,
                review: false,
            },
            {
                status: statusFixture(),
                apply: applyFixture(),
                implement: true,
                review: true,
            },
        ];

        for (const { status, apply, implement, review } of cases) {
            const lifecycle = deriveWorkflowState(status, apply).lifecycle;
            const actionTypes = deriveEligibleActions(status, apply).map(action => action.type);

            expect(lifecycle.implement.allowed).toBe(implement);
            expect(
                actionTypes.includes("enter-implementation") || actionTypes.includes("remediate"),
            ).toBe(implement);
            expect(lifecycle.review.allowed).toBe(review);
            expect(actionTypes.includes("enter-review")).toBe(review);
        }
    });
});
