import { describe, expect, test } from "bun:test";
import { requiredClosure, transitiveRequires } from "../../src/coordinator/artifact-graph.js";
import type { NormalizedArtifact } from "../../src/openspec/status.js";

function artifact(id: string, requires: readonly string[] = []): NormalizedArtifact {
    return { id, outputPath: `openspec/changes/example/${id}.md`, status: "ready", requires };
}

function lookup(...artifacts: readonly NormalizedArtifact[]): Map<string, NormalizedArtifact> {
    return new Map(artifacts.map(artifact => [artifact.id, artifact]));
}

describe("requiredClosure", () => {
    test("includes roots and their transitive requires", () => {
        const artifacts = lookup(
            artifact("tasks", ["design"]),
            artifact("design", ["proposal"]),
            artifact("proposal"),
        );
        expect(requiredClosure(["tasks"], artifacts)).toEqual(
            new Set(["tasks", "design", "proposal"]),
        );
    });

    test("ignores missing artifact ids without failing", () => {
        const artifacts = lookup(artifact("proposal"));
        expect(requiredClosure(["proposal", "missing"], artifacts)).toEqual(
            new Set(["proposal", "missing"]),
        );
    });

    test("terminates on dependency cycles", () => {
        const artifacts = lookup(artifact("first", ["second"]), artifact("second", ["first"]));
        expect(requiredClosure(["first"], artifacts)).toEqual(new Set(["first", "second"]));
    });
});

describe("transitiveRequires", () => {
    test("finds direct dependencies", () => {
        const artifacts = lookup(artifact("tasks", ["design"]), artifact("design"));
        expect(transitiveRequires("tasks", "design", artifacts)).toBe(true);
    });

    test("finds transitive dependencies through the chain", () => {
        const artifacts = lookup(
            artifact("tasks", ["design"]),
            artifact("design", ["proposal"]),
            artifact("proposal"),
        );
        expect(transitiveRequires("tasks", "proposal", artifacts)).toBe(true);
    });

    test("returns false for unrelated artifacts", () => {
        const artifacts = lookup(artifact("alpha"), artifact("beta"));
        expect(transitiveRequires("alpha", "beta", artifacts)).toBe(false);
    });

    test("returns false when the traversed artifact is missing", () => {
        expect(transitiveRequires("ghost", "proposal", lookup(artifact("proposal")))).toBe(false);
    });

    test("terminates on dependency cycles", () => {
        const artifacts = lookup(artifact("first", ["second"]), artifact("second", ["first"]));
        expect(transitiveRequires("first", "second", artifacts)).toBe(true);
    });
});
