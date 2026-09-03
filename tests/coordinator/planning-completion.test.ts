import { describe, expect, test } from "bun:test";
import {
    collectUnknownRequired,
    derivePlanningCompletion,
    satisfiedArtifactIds,
} from "../../src/coordinator/planning-completion.js";
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

describe("derivePlanningCompletion", () => {
    test("reports complete when the closure is satisfied and the flag is true", () => {
        const status = fixture(
            [artifact("proposal", "done"), artifact("tasks", "done", ["proposal"])],
            ["proposal", "tasks"],
            true,
        );

        expect(derivePlanningCompletion(status)).toEqual({ complete: true });
    });

    test("treats an absent flag as planning complete", () => {
        const status = fixture([artifact("proposal", "done")], ["proposal"]);

        expect(derivePlanningCompletion(status)).toEqual({ complete: true });
    });

    test("reports closure-unsatisfied while a closure artifact is neither done nor skipped", () => {
        const status = fixture(
            [artifact("proposal", "done"), artifact("tasks", "ready", ["proposal"])],
            ["proposal", "tasks"],
        );

        expect(derivePlanningCompletion(status)).toEqual({
            complete: false,
            reason: "closure-unsatisfied",
        });
    });

    test("reports flag-false only when the closure is satisfied", () => {
        const status = fixture([artifact("proposal", "done")], ["proposal"], false);

        expect(derivePlanningCompletion(status)).toEqual({ complete: false, reason: "flag-false" });
    });

    test("prefers closure-unsatisfied over flag-false when both apply", () => {
        const status = fixture([artifact("proposal", "ready")], ["proposal"], false);

        expect(derivePlanningCompletion(status)).toEqual({
            complete: false,
            reason: "closure-unsatisfied",
        });
    });

    test("fails closed when applyRequires references an unknown artifact", () => {
        const status = fixture(
            [artifact("proposal", "done")],
            ["proposal", "nonexistent", "ghost"],
        );

        expect(derivePlanningCompletion(status)).toEqual({
            complete: false,
            reason: "unknown-required",
            unknownRequired: ["nonexistent", "ghost"],
        });
    });

    test("fails closed when an artifact requires an unknown artifact", () => {
        const status = fixture([artifact("proposal", "done", ["ghost"])], ["proposal"]);

        expect(derivePlanningCompletion(status)).toEqual({
            complete: false,
            reason: "unknown-required",
            unknownRequired: ["ghost"],
        });
    });

    test("prefers unknown-required over closure-unsatisfied", () => {
        const status = fixture([artifact("proposal", "ready")], ["proposal", "ghost"]);

        expect(derivePlanningCompletion(status)).toEqual({
            complete: false,
            reason: "unknown-required",
            unknownRequired: ["ghost"],
        });
    });

    test("treats skipped artifacts as satisfied closure members", () => {
        const status = fixture(
            [artifact("proposal", "skipped"), artifact("tasks", "done", ["proposal"])],
            ["proposal", "tasks"],
        );

        expect(derivePlanningCompletion(status)).toEqual({ complete: true });
    });

    test("treats an empty applyRequires closure as complete unless the flag is false", () => {
        expect(derivePlanningCompletion(fixture([], []))).toEqual({ complete: true });
        expect(derivePlanningCompletion(fixture([], [], false))).toEqual({
            complete: false,
            reason: "flag-false",
        });
    });

    test("survives dependency cycles without hanging", () => {
        const cyclic = fixture(
            [artifact("proposal", "ready", ["tasks"]), artifact("tasks", "ready", ["proposal"])],
            ["proposal", "tasks"],
        );

        expect(derivePlanningCompletion(cyclic)).toEqual({
            complete: false,
            reason: "closure-unsatisfied",
        });

        const done = fixture(
            [artifact("proposal", "done", ["tasks"]), artifact("tasks", "done", ["proposal"])],
            ["proposal", "tasks"],
        );

        expect(derivePlanningCompletion(done)).toEqual({ complete: true });
    });
});

describe("satisfiedArtifactIds", () => {
    test("contains only done and skipped artifact ids", () => {
        const status = fixture(
            [
                artifact("proposal", "done"),
                artifact("design", "skipped"),
                artifact("tasks", "ready"),
                artifact("specs", "blocked"),
            ],
            ["proposal"],
        );

        expect([...satisfiedArtifactIds(status)].sort()).toEqual(["design", "proposal"]);
    });
});

describe("collectUnknownRequired", () => {
    test("returns unknown ids in first-seen order without duplicates", () => {
        const status = fixture(
            [artifact("proposal", "done", ["ghost", "phantom", "ghost"])],
            ["proposal", "nonexistent", "ghost"],
        );

        expect(
            collectUnknownRequired(status, new Map(status.artifacts.map(a => [a.id, a]))),
        ).toEqual(["nonexistent", "ghost", "phantom"]);
    });

    test("returns empty when every referenced id exists", () => {
        const status = fixture(
            [artifact("proposal", "done"), artifact("tasks", "ready", ["proposal"])],
            ["proposal", "tasks"],
        );

        expect(
            collectUnknownRequired(status, new Map(status.artifacts.map(a => [a.id, a]))),
        ).toEqual([]);
    });
});
