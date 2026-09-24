import { existsSync, readdirSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "bun:test";
import { buildOrchestratorPrompt } from "../src/agents/orchestrator.js";
import { AGENT_IDS } from "../src/agents/ids.js";
import { loadPrompt, resolveIncludes } from "../src/prompts.js";

function loadSpecialistPrompt(id: keyof typeof AGENT_IDS): string {
    return loadPrompt(AGENT_IDS[id]);
}

const ENGRAM_AWARE_ROLES = [
    "explorer",
    "planner",
    "designer",
    "implementer",
    "reviewer",
    "frontier",
    "orchestrator",
] as const satisfies ReadonlyArray<keyof typeof AGENT_IDS>;

const ALL_SPECIALIST_ROLES = [
    ...ENGRAM_AWARE_ROLES.filter(role => role !== "orchestrator"),
    "reviewCorrectness",
    "reviewRisk",
    "reviewQuality",
] as const satisfies ReadonlyArray<keyof typeof AGENT_IDS>;

const ENGRAM_AWARE_SOURCE_FILES = [
    "explorer.md",
    "planner.md",
    "designer.md",
    "implementer.md",
    "reviewer.md",
    "frontier.md",
    "orchestrator.md",
] as const;

const SHARED_ENGRAM_POLICY_ANCHORS = [
    "Write SpecOps memory at project scope, never personal scope.",
    "Every breadcrumb names the active OpenSpec change in its title or body.",
    "Where the tooling supports a `topic_key`, use `change/<change-name>/<subject>` so same-subject breadcrumbs update in place while distinct subjects stay distinct; never use one key for the whole change.",
    "Read memory only when it would materially improve the pass, chiefly when resuming the same active change (continuation, remediation, revision, or re-review) rather than fresh first-pass work.",
    "Use one focused lookup keyed by the change name, not exploratory sweeps.",
    "Treat results as leads to verify against current approved artifacts, repository state, and executed evidence, never facts.",
    "Write only durably useful context for whoever works the change next: non-obvious gotchas, discovered constraints or environment quirks, a decision's rationale, or conventions worth carrying.",
    "Keep writes concise and factual; incremental writes during a pass are permitted.",
    "If nothing durable was learned, write nothing; a pass without a write is complete and writes are never required.",
    "Workflow state includes:",
    "task checkbox and completion state; dispatch and assignment ownership including assigned task ids;",
    "scheduler, fan-out, and parallel-progress state;",
    "review verdicts, findings, and specialist-disposition state;",
    "approval, checkpoint, and lifecycle state;",
    "plan completion, archive, and durable status;",
    "run-scoped capsules — the Project Context capsule and the Todo projection.",
    "proposal, specs, design, and tasks content is never copied into memory — only context about it.",
] as const;

const CAPABILITY_AWARE_SOURCE_FILES = [
    "implementer.md",
    "reviewer.md",
    "review-correctness.md",
    "review-risk.md",
    "review-quality.md",
] as const;

const SHARED_CAPABILITY_POLICY_ANCHORS = [
    "## Advisory capabilities",
    "A hint is orientation, not an assignment",
    "Loading is best-effort",
    "report an explicit evidence gap naming it and what remains unverified",
    "never broaden assigned scope or review lens",
] as const;

async function withTempPromptDirectory(run: (directory: string) => Promise<void>): Promise<void> {
    const directory = await mkdtemp(path.join(os.tmpdir(), "specops-prompts-"));
    try {
        await run(directory);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}

describe("resolveIncludes", () => {
    test("resolves nested whole-line includes and preserves other placeholders", async () => {
        await withTempPromptDirectory(async directory => {
            await writeFile(path.join(directory, "nested.md"), "Nested\n", "utf8");
            await writeFile(
                path.join(directory, "fragment.md"),
                "First\n{{include:nested.md}}\nLast\n",
                "utf8",
            );

            expect(
                resolveIncludes(
                    "Start\n{{include:fragment.md}}\n{{FRONTIER_ESCALATION_STATE}}",
                    directory,
                ),
            ).toBe("Start\nFirst\nNested\nLast\n{{FRONTIER_ESCALATION_STATE}}");
        });
    });

    test("rejects missing, empty, cyclic, and escaping fragments", async () => {
        await withTempPromptDirectory(async directory => {
            expect(() => resolveIncludes("{{include:missing.md}}", directory)).toThrow(
                "SpecOps prompt include not found: missing.md",
            );

            await writeFile(path.join(directory, "empty.md"), "  \n", "utf8");
            expect(() => resolveIncludes("{{include:empty.md}}", directory)).toThrow(
                "SpecOps prompt fragment is empty: empty.md",
            );

            await writeFile(path.join(directory, "a.md"), "{{include:b.md}}\n", "utf8");
            await writeFile(path.join(directory, "b.md"), "{{include:a.md}}\n", "utf8");
            expect(() => resolveIncludes("{{include:a.md}}", directory)).toThrow(
                "SpecOps prompt include cycle: a.md",
            );

            const outsidePath = path.join(path.dirname(directory), "specops-outside.md");
            await writeFile(outsidePath, "outside\n", "utf8");
            try {
                expect(() =>
                    resolveIncludes("{{include:../specops-outside.md}}", directory),
                ).toThrow("SpecOps prompt include escapes prompts directory");
            } finally {
                await rm(outsidePath, { force: true });
            }
        });
    });

    test("allows fragments in nested directories", async () => {
        await withTempPromptDirectory(async directory => {
            await mkdir(path.join(directory, "shared"));
            await writeFile(path.join(directory, "shared", "fragment.md"), "Shared\n", "utf8");
            expect(resolveIncludes("{{include:shared/fragment.md}}\n", directory)).toBe("Shared\n");
        });
    });
});

describe("terminal handoff contracts", () => {
    test("standard specialist handoffs are terminal", () => {
        for (const role of ["explorer", "planner", "designer", "implementer"] as const) {
            const prompt = loadSpecialistPrompt(role);
            expect(prompt).toContain("This handoff is terminal");
            expect(prompt).toContain(
                "After emitting it, make no tool calls and emit no further text",
            );
            expect(prompt).toContain(
                "Every tool call you need (including any Engram write) must occur before this handoff",
            );
        }
    });

    test("reviewer and Frontier retain their terminal return contracts", () => {
        const reviewer = loadSpecialistPrompt("reviewer");
        expect(reviewer).toContain("## Terminal return");
        expect(reviewer).toMatch(
            /Your `PASS`\/`FAIL` verdict, and any `FRONTIER ELIGIBLE BLOCKER`.*is terminal/s,
        );

        const frontier = loadSpecialistPrompt("frontier");
        expect(frontier).toContain("This advice block is terminal");
        expect(frontier).toContain(
            "After emitting it, make no tool calls and emit no further text",
        );
    });
});

describe("orchestrator sync-flow contract", () => {
    function expectSyncFlowContract(prompt: string): void {
        expect(prompt).toContain("## Sync flow");
        const start = prompt.indexOf("## Sync flow");
        const end = prompt.indexOf("## Delegation contract", start);
        const syncFlow = prompt.slice(start, end);
        expect(syncFlow).not.toContain("specops_status");
        expect(syncFlow).toContain("openspec instructions specs --change <name> --json");
        expect(syncFlow).toContain("existingOutputPaths");
        expect(syncFlow).toContain("planningHome.root");
        expect(syncFlow).toContain("With none, report");
        expect(syncFlow).toContain("never touch main specs");
        expect(syncFlow).toContain("Never modify `changeRoot`");
        expect(syncFlow).toContain("openspec archive");
    }

    test("shared orchestrator prompt and both modes retain sync invariants", () => {
        expectSyncFlowContract(loadPrompt(AGENT_IDS.orchestrator));
        expectSyncFlowContract(buildOrchestratorPrompt("interactive", false));
        expectSyncFlowContract(buildOrchestratorPrompt("auto", false));
    });
});

describe("shared Engram policy", () => {
    const promptsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "prompts");

    test("every Engram-aware role includes the shared policy exactly once", async () => {
        for (const file of ENGRAM_AWARE_SOURCE_FILES) {
            const source = await readFile(path.join(promptsDir, file), "utf8");
            expect(source).toContain("{{include:shared/engram.md}}");
        }

        const shared = await readFile(path.join(promptsDir, "shared", "engram.md"), "utf8");
        const sources = await Promise.all(
            readdirSync(promptsDir, { recursive: true })
                .map((entry: unknown) => String(entry))
                .filter(entry => entry.endsWith(".md"))
                .map(async entry => readFile(path.join(promptsDir, entry), "utf8")),
        );

        for (const anchor of SHARED_ENGRAM_POLICY_ANCHORS) {
            expect(shared).toContain(anchor);
            expect(
                sources.reduce((count, content) => count + (content.split(anchor).length - 1), 0),
            ).toBe(1);
            for (const file of ENGRAM_AWARE_SOURCE_FILES) {
                const source = await readFile(path.join(promptsDir, file), "utf8");
                expect(source).not.toContain(anchor);
            }
        }

        for (const role of ENGRAM_AWARE_ROLES) {
            expect(loadSpecialistPrompt(role)).toContain("## Engram");
        }
    });

    test("specialist prompts do not expose concrete memory tool names", () => {
        for (const role of ALL_SPECIALIST_ROLES)
            expect(loadSpecialistPrompt(role)).not.toContain("mem_");
    });

    test("review critics remain free of memory guidance", () => {
        for (const role of ["reviewCorrectness", "reviewRisk", "reviewQuality"] as const) {
            const prompt = loadSpecialistPrompt(role);
            expect(prompt).not.toContain("## Engram");
            expect(prompt).not.toContain("topic_key");
            expect(prompt).not.toContain("change/<change-name>");
        }
    });
});

describe("shared capability policy", () => {
    const promptsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "prompts");

    test("keeps the capability contract in one shared fragment and exactly five consumers", async () => {
        const sharedFile = "shared/capability-hints.md";
        const include = "{{include:shared/capability-hints.md}}";
        const sourceFiles = readdirSync(promptsDir, { recursive: true })
            .map((entry: unknown) => String(entry))
            .filter(entry => entry.endsWith(".md"));
        const sources = await Promise.all(
            sourceFiles.map(async file => ({
                file,
                content: await readFile(path.join(promptsDir, file), "utf8"),
            })),
        );
        const shared = sources.find(source => source.file === sharedFile)?.content;

        expect(shared).toBeDefined();
        for (const anchor of SHARED_CAPABILITY_POLICY_ANCHORS) {
            expect(shared).toContain(anchor);
            expect(
                sources.reduce(
                    (count, source) => count + (source.content.split(anchor).length - 1),
                    0,
                ),
            ).toBe(1);
            expect(
                sources
                    .filter(source => source.content.includes(anchor))
                    .map(source => source.file),
            ).toEqual([sharedFile]);
        }

        const includeSources = sources
            .filter(source => source.content.includes(include))
            .map(source => source.file)
            .sort();
        expect(includeSources).toEqual([...CAPABILITY_AWARE_SOURCE_FILES].sort());
        for (const file of CAPABILITY_AWARE_SOURCE_FILES) {
            const source = sources.find(entry => entry.file === file)?.content;
            expect(source?.split(include).length).toBe(2);
        }
    });
});

describe("prompt boundaries and budgets", () => {
    test("orchestrator prompts use config snapshots and no legacy placeholders", async () => {
        const promptsDir = path.resolve(
            path.dirname(fileURLToPath(import.meta.url)),
            "..",
            "prompts",
        );
        for (const file of readdirSync(promptsDir).filter(file =>
            file.startsWith("orchestrator"),
        )) {
            expect(await readFile(path.join(promptsDir, file), "utf8")).not.toContain(
                "{{maxAutoReviewIterations}}",
            );
        }

        for (const mode of ["interactive", "auto"] as const) {
            for (const frontier of [false, true]) {
                const prompt = buildOrchestratorPrompt(mode, frontier);
                expect(prompt).not.toContain("{{maxAutoReviewIterations}}");
                expect(prompt).toContain("maxSubagentConcurrency");
            }
        }
        expect(buildOrchestratorPrompt("auto", false)).toContain(
            "Read `maxAutoReviewIterations` from `specops_config`",
        );
    });

    test("the packaged prompt directory exists and rewritten roles fit current budgets", () => {
        const promptsDir = path.resolve(
            path.dirname(fileURLToPath(import.meta.url)),
            "..",
            "prompts",
        );
        expect(existsSync(promptsDir)).toBe(true);
        expect(loadSpecialistPrompt("planner").length).toBeLessThan(17_000);
        expect(loadSpecialistPrompt("designer").length).toBeLessThan(13_000);
        expect(loadSpecialistPrompt("implementer").length).toBeLessThan(18_000);
        expect(buildOrchestratorPrompt("interactive", true).length).toBeLessThan(36_500);
    });

    test("Orchestrator retains the hard Bash boundary", () => {
        const prompt = loadPrompt(AGENT_IDS.orchestrator);
        const start = prompt.indexOf("## Bash discipline");
        const end = prompt.indexOf("## Startup", start);
        const section = prompt.slice(start, end);

        for (const command of [
            "`ls`",
            "`find`",
            "`grep`/`rg`",
            "`cat`",
            "`git`",
            "`pwd`",
            "`sed`",
        ]) {
            expect(section).toContain(command);
        }
        expect(section).toContain("equivalent");
        expect(section).toContain("specops-explorer");
        expect(section).toContain("Treat denial as a");
    });
});

describe("rewritten role contracts", () => {
    test("Orchestrator consumes runtime legality and preserves model judgement", () => {
        const prompt = buildOrchestratorPrompt("interactive", false);
        expect(prompt).toContain("eligibleActions");
        expect(prompt).toContain("legal, not recommended");
        expect(prompt).toContain("engineering judgement");
        expect(prompt).toContain("specops_review_lanes");
        expect(prompt).toContain("reviewLaneId");
        expect(prompt).toContain("fanInComplete: true");
        expect(prompt).toMatch(/Reset\s+any prior round/);
        expect(prompt).not.toContain("specops_progress");
        expect(prompt).not.toContain("createRollingScheduler");
        expect(prompt).not.toContain("reverse-dependency reachability");
    });

    test("Planner and Designer receive current-job responsibility through dispatch", () => {
        for (const role of ["planner", "designer"] as const) {
            const prompt = loadSpecialistPrompt(role);
            expect(prompt).toContain("current dispatch");
            expect(prompt).toContain("artifact id");
            expect(prompt).toContain("outputPath");
            expect(prompt).toContain("openspec instructions <artifact-id>");
            expect(prompt).toContain("schema and template exactly");
            expect(prompt).not.toContain("createRollingScheduler");
        }
    });

    test("Implementer keeps scoped task semantics while leaving assignment legality to runtime", () => {
        const prompt = loadSpecialistPrompt("implementer");
        expect(prompt).toContain("assignedTaskIds");
        expect(prompt).toMatch(/entire\s+assignment/);
        expect(prompt).toContain("dispatch boundary validates");
        expect(prompt).toContain("stale assignment");
        expect(prompt).toContain("do not fabricate completion");
        expect(prompt).not.toContain("maxSubagentConcurrency");
        expect(prompt).not.toContain("specops_progress");
    });
});
