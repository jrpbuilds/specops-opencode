import { describe, expect, test } from "bun:test";
import { deriveWorkflowState } from "../../src/coordinator/workflow-state.js";
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
