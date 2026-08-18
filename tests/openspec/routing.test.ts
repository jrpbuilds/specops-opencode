import { describe, expect, test } from "bun:test";
import { nextPlanningRoute, type PlanningRoute } from "../../src/openspec/routing.js";
import type { NormalizedArtifact, NormalizedStatus } from "../../src/openspec/status.js";

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

function expectAuthor(
    route: PlanningRoute,
    expected: Pick<
        Extract<PlanningRoute, { kind: "author" }>,
        "artifactId" | "outputPath" | "specialist"
    >,
): void {
    expect(route).toEqual({ kind: "author", ...expected });
}

describe("nextPlanningRoute", () => {
    test("spec-driven-baseline routes proposal to the generic planner", () => {
        const status = fixture(
            [
                artifact("proposal", "ready"),
                artifact(
                    "specs/example",
                    "blocked",
                    ["proposal"],
                    "openspec/changes/example/specs/example/spec.md",
                ),
                artifact("design", "blocked", ["specs/example"]),
                artifact("tasks", "blocked", ["design"]),
            ],
            ["proposal", "specs/example", "design", "tasks"],
            false,
        );
        expectAuthor(nextPlanningRoute(status), {
            artifactId: "proposal",
            outputPath: output("proposal"),
            specialist: "planner-generic",
        });
    });

    test("spec-driven-mid-plan routes design to the designer", () => {
        const status = fixture(
            [
                artifact("proposal", "done"),
                artifact(
                    "specs/example",
                    "done",
                    ["proposal"],
                    "openspec/changes/example/specs/example/spec.md",
                ),
                artifact("design", "ready", ["specs/example"]),
                artifact("tasks", "blocked", ["design"]),
            ],
            ["proposal", "specs/example", "design", "tasks"],
            false,
        );
        expectAuthor(nextPlanningRoute(status), {
            artifactId: "design",
            outputPath: output("design"),
            specialist: "designer",
        });
    });

    test("spec-driven-plan-complete is plan-ready", () => {
        const status = fixture(
            [
                artifact("proposal", "done"),
                artifact("design", "done", ["proposal"]),
                artifact("tasks", "done", ["design"]),
            ],
            ["proposal", "design", "tasks"],
            true,
        );
        expect(nextPlanningRoute(status)).toEqual({ kind: "plan-ready" });
    });

    test("custom-ids use the generic planner fallback", () => {
        const status = {
            ...fixture(
                [
                    artifact("brief", "ready", [], "openspec/changes/example/brief.md"),
                    artifact(
                        "blueprint",
                        "blocked",
                        ["brief"],
                        "openspec/changes/example/blueprint.md",
                    ),
                    artifact(
                        "work-items",
                        "blocked",
                        ["blueprint"],
                        "openspec/changes/example/work-items.md",
                    ),
                ],
                ["brief", "blueprint", "work-items"],
                false,
            ),
            schemaName: "minimal",
        };
        expectAuthor(nextPlanningRoute(status), {
            artifactId: "brief",
            outputPath: "openspec/changes/example/brief.md",
            specialist: "planner-generic",
        });
    });

    test("omitted-design routes the tasks artifact directly", () => {
        const status = fixture(
            [
                artifact("proposal", "done"),
                artifact(
                    "specs/example",
                    "done",
                    ["proposal"],
                    "openspec/changes/example/specs/example/spec.md",
                ),
                artifact("tasks", "ready", ["specs/example"]),
            ],
            ["proposal", "specs/example", "tasks"],
            false,
        );
        expectAuthor(nextPlanningRoute(status), {
            artifactId: "tasks",
            outputPath: output("tasks"),
            specialist: "planner-generic",
        });
    });

    test("proposal-and-tasks-only routes both artifacts to the generic planner", () => {
        const initial = fixture(
            [artifact("proposal", "ready"), artifact("tasks", "blocked", ["proposal"])],
            ["proposal", "tasks"],
            false,
        );
        expectAuthor(nextPlanningRoute(initial), {
            artifactId: "proposal",
            outputPath: output("proposal"),
            specialist: "planner-generic",
        });

        const afterProposal = fixture(
            [artifact("proposal", "done"), artifact("tasks", "ready", ["proposal"])],
            ["proposal", "tasks"],
            false,
        );
        expectAuthor(nextPlanningRoute(afterProposal), {
            artifactId: "tasks",
            outputPath: output("tasks"),
            specialist: "planner-generic",
        });
    });

    test("research-then-proposal-then-tasks preserves chain order with the generic planner", () => {
        const research = fixture(
            [
                artifact("research", "ready"),
                artifact("proposal", "blocked", ["research"]),
                artifact("tasks", "blocked", ["proposal"]),
            ],
            ["research", "proposal", "tasks"],
            false,
        );
        expectAuthor(nextPlanningRoute(research), {
            artifactId: "research",
            outputPath: output("research"),
            specialist: "planner-generic",
        });

        const proposal = fixture(
            [
                artifact("research", "done"),
                artifact("proposal", "ready", ["research"]),
                artifact("tasks", "blocked", ["proposal"]),
            ],
            ["research", "proposal", "tasks"],
            false,
        );
        expectAuthor(nextPlanningRoute(proposal), {
            artifactId: "proposal",
            outputPath: output("proposal"),
            specialist: "planner-generic",
        });

        const tasks = fixture(
            [
                artifact("research", "done"),
                artifact("proposal", "done", ["research"]),
                artifact("tasks", "ready", ["proposal"]),
            ],
            ["research", "proposal", "tasks"],
            false,
        );
        expectAuthor(nextPlanningRoute(tasks), {
            artifactId: "tasks",
            outputPath: output("tasks"),
            specialist: "planner-generic",
        });
    });

    test("default-plus-extra-review routes the conventional design to the designer", () => {
        const proposal = fixture(
            [
                artifact("proposal", "ready"),
                artifact("specs/example", "blocked", ["proposal"]),
                artifact("design", "blocked", ["specs/example"]),
                artifact("tasks", "blocked", ["design"]),
                artifact("review", "blocked", ["tasks"]),
            ],
            ["proposal", "specs/example", "design", "tasks", "review"],
            false,
        );
        expectAuthor(nextPlanningRoute(proposal), {
            artifactId: "proposal",
            outputPath: output("proposal"),
            specialist: "planner-generic",
        });

        const design = fixture(
            [
                artifact("proposal", "done"),
                artifact("specs/example", "done", ["proposal"]),
                artifact("design", "ready", ["specs/example"]),
                artifact("tasks", "blocked", ["design"]),
                artifact("review", "blocked", ["tasks"]),
            ],
            ["proposal", "specs/example", "design", "tasks", "review"],
            false,
        );
        expectAuthor(nextPlanningRoute(design), {
            artifactId: "design",
            outputPath: output("design"),
            specialist: "designer",
        });

        const tasks = fixture(
            [
                artifact("proposal", "done"),
                artifact("specs/example", "done", ["proposal"]),
                artifact("design", "done", ["specs/example"]),
                artifact("tasks", "ready", ["design"]),
                artifact("review", "blocked", ["tasks"]),
            ],
            ["proposal", "specs/example", "design", "tasks", "review"],
            false,
        );
        expectAuthor(nextPlanningRoute(tasks), {
            artifactId: "tasks",
            outputPath: output("tasks"),
            specialist: "planner-generic",
        });

        const review = fixture(
            [
                artifact("proposal", "done"),
                artifact("specs/example", "done", ["proposal"]),
                artifact("design", "done", ["specs/example"]),
                artifact("tasks", "done", ["design"]),
                artifact("review", "ready", ["tasks"]),
            ],
            ["proposal", "specs/example", "design", "tasks", "review"],
            false,
        );
        expectAuthor(nextPlanningRoute(review), {
            artifactId: "review",
            outputPath: output("review"),
            specialist: "planner-generic",
        });
    });

    test("parallel-ready uses schema order for equal unblock scores", () => {
        const status = fixture(
            [artifact("A", "ready"), artifact("B", "ready"), artifact("C", "blocked", ["A", "B"])],
            ["A", "B", "C"],
            false,
        );
        expectAuthor(nextPlanningRoute(status), {
            artifactId: "A",
            outputPath: output("A"),
            specialist: "planner-generic",
        });
        const afterA = fixture(
            [artifact("A", "done"), artifact("B", "ready"), artifact("C", "blocked", ["A", "B"])],
            ["A", "B", "C"],
            false,
        );
        expectAuthor(nextPlanningRoute(afterA), {
            artifactId: "B",
            outputPath: output("B"),
            specialist: "planner-generic",
        });
    });

    test("skipped-design satisfies the tasks dependency without targeting design", () => {
        const status = fixture(
            [
                artifact("proposal", "done"),
                artifact("design", "skipped", ["proposal"]),
                { ...artifact("tasks", "blocked", ["design"]), missingDeps: ["design"] },
            ],
            ["proposal", "design", "tasks"],
            false,
        );
        const route = nextPlanningRoute(status);
        expectAuthor(route, {
            artifactId: "tasks",
            outputPath: output("tasks"),
            specialist: "planner-generic",
        });
        expect(route).not.toMatchObject({ artifactId: "design" });
    });

    test("resumed-partial routes from current done state", () => {
        const status = fixture(
            [
                artifact("proposal", "done"),
                artifact(
                    "specs/example",
                    "done",
                    ["proposal"],
                    "openspec/changes/example/specs/example/spec.md",
                ),
                artifact("design", "ready", ["specs/example"]),
                artifact("tasks", "blocked", ["design"]),
            ],
            ["proposal", "specs/example", "design", "tasks"],
            false,
        );
        expectAuthor(nextPlanningRoute(status), {
            artifactId: "design",
            outputPath: output("design"),
            specialist: "designer",
        });
    });

    test("unknown-required-id blocks without fabricating an artifact", () => {
        const status = fixture(
            [artifact("proposal", "ready")],
            ["proposal", "missing-artifact"],
            false,
        );
        expect(nextPlanningRoute(status)).toEqual({
            kind: "blocked",
            reason: "Unknown required artifact id(s): missing-artifact",
            unknownRequired: ["missing-artifact"],
        });
    });

    test("flag-absent-closure-satisfied is plan-ready", () => {
        const status = fixture([artifact("proposal", "done")], ["proposal"]);
        expect(nextPlanningRoute(status)).toEqual({ kind: "plan-ready" });
    });

    test("false planning flag with a satisfied closure is blocked", () => {
        const status = fixture([artifact("proposal", "done")], ["proposal"], false);
        expect(nextPlanningRoute(status)).toEqual({
            kind: "blocked",
            reason: "isPlanningComplete false with closure satisfied",
        });
    });

    test("unsatisfied closure with no feasible artifact is blocked", () => {
        const status = fixture(
            [artifact("first", "blocked", ["second"]), artifact("second", "blocked", ["first"])],
            ["first"],
            false,
        );
        expect(nextPlanningRoute(status)).toEqual({
            kind: "blocked",
            reason: "No feasible artifact in the applyRequires dependency closure",
        });
    });

    test("does not cache routing decisions between calls", () => {
        const first = fixture([artifact("proposal", "ready")], ["proposal"], false);
        const second = fixture([artifact("proposal", "done")], ["proposal"], true);
        expect(nextPlanningRoute(first)).not.toEqual(nextPlanningRoute(second));
        expect(nextPlanningRoute(first)).toEqual(nextPlanningRoute(first));
    });
});
