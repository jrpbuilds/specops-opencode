import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, test, expect } from "bun:test";
import yaml from "js-yaml";

type Workflow = {
    on?: Record<string, unknown>;
    jobs?: Record<string, { steps?: unknown[] }>;
};

describe("CI workflow triggers", () => {
    test("documents the trigger matrix and unchanged check commands", () => {
        const workflowPath = path.join(import.meta.dir, "../.github/workflows/ci.yml");
        const text = readFileSync(workflowPath, "utf8");
        const workflow = yaml.load(text, { schema: yaml.JSON_SCHEMA }) as Workflow;
        const triggers = workflow.on;

        expect(triggers).toHaveProperty("push");
        expect(triggers).toHaveProperty("pull_request");

        const push = triggers?.push as Record<string, unknown> | undefined;
        expect(push?.branches).toEqual(["main"]);

        const pullRequest = triggers?.pull_request;
        if (pullRequest && typeof pullRequest === "object" && !Array.isArray(pullRequest)) {
            expect(pullRequest).not.toHaveProperty("branches");
            expect(pullRequest).not.toHaveProperty("branches-ignore");
            expect(pullRequest).not.toHaveProperty("paths");
        }

        expect(workflow.jobs).toHaveProperty("check");
        const checkJob = workflow.jobs?.check;
        const runSteps = (checkJob?.steps ?? [])
            .filter(
                (step): step is Record<string, unknown> =>
                    typeof step === "object" && step !== null && !Array.isArray(step),
            )
            .filter(step => "run" in step)
            .map(step => step.run);

        expect(runSteps).toEqual(["bun install --frozen-lockfile", "bun run check"]);
    });
});
