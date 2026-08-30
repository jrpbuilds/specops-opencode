import { readdirSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "bun:test";
import { buildCoordinatorPrompt } from "../src/agents/coordinator.js";
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
    "coordinator",
] as const satisfies ReadonlyArray<keyof typeof AGENT_IDS>;

const ALL_SPECIALIST_ROLES = [
    ...ENGRAM_AWARE_ROLES.filter(role => role !== "coordinator"),
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
    "coordinator.md",
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

function expectSyncFlowContract(prompt: string): void {
    expect(prompt).toContain("## Sync flow");
    const syncFlowStart = prompt.indexOf("## Sync flow");
    const syncFlowEnd = prompt.indexOf("## Delegation contract", syncFlowStart);
    const syncFlow = prompt.slice(syncFlowStart, syncFlowEnd);
    expect(syncFlow).not.toContain("specops_status");
    expect(syncFlow).toContain("openspec instructions specs --change <name> --json");
    expect(syncFlow).toMatch(
        /canonical source for `existingOutputPaths` and\s+`planningHome\.root`/,
    );
    expect(syncFlow).toContain("If `existingOutputPaths` is empty");
    expect(syncFlow).toMatch(/report\s+"nothing to sync"\s+and stop/);
    expect(prompt).toContain("specops-implementer");
    expect(prompt).toContain("merge steps 4a–4d");
    expect(prompt).toContain("never invoke `openspec archive`");
}

function expectBashDisciplineContract(prompt: string): void {
    const sectionStart = prompt.indexOf("## Bash discipline");
    expect(sectionStart).toBeGreaterThanOrEqual(0);
    const sectionEnd = prompt.indexOf("## ", sectionStart + 3);
    expect(sectionEnd).toBeGreaterThan(sectionStart);
    const section = prompt.slice(sectionStart, sectionEnd);

    expect(section).toContain("`ls`");
    expect(section).toContain("`find`");
    expect(section).toContain("`grep`/`rg`");
    expect(section).toContain("`cat`");
    expect(section).toContain("`head`");
    expect(section).toContain("`tail`");
    expect(section).toContain("`git`");
    expect(section).toContain("`pwd`");
    expect(section).toContain("`sed`");
    expect(section).toContain("equivalent commands");
    expect(section).toContain("shell composition");
    expect(section).toContain("`Read`, `Glob`, or `Grep`");
    expect(section).toContain("specops-explorer");
    expect(section).toContain("denial as a boundary");
    expect(section).toContain("coordinator-native");
}

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

    test("rejects missing and empty fragments", async () => {
        await withTempPromptDirectory(async directory => {
            expect(() => resolveIncludes("{{include:missing.md}}", directory)).toThrow(
                "SpecOps prompt include not found: missing.md",
            );

            await writeFile(path.join(directory, "empty.md"), "  \n", "utf8");
            expect(() => resolveIncludes("{{include:empty.md}}", directory)).toThrow(
                "SpecOps prompt fragment is empty: empty.md",
            );
        });
    });

    test("rejects include cycles and paths outside the prompt directory", async () => {
        await withTempPromptDirectory(async directory => {
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
                ).toThrow(
                    "SpecOps prompt include escapes prompts directory: ../specops-outside.md",
                );
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

describe("specialist terminal handoff contract", () => {
    const ENVELOPE_ROLES: Array<keyof typeof AGENT_IDS> = [
        "explorer",
        "planner",
        "designer",
        "implementer",
    ];

    test("prompts using the standard handoff envelope require terminal handoff message", () => {
        for (const role of ENVELOPE_ROLES) {
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

    test("reviewer treats PASS/FAIL/blocker as a terminal return", () => {
        const prompt = loadSpecialistPrompt("reviewer");
        expect(prompt).toContain("## Terminal return");
        expect(prompt).toContain(
            "Your `PASS`/`FAIL` verdict, and any `FRONTIER ELIGIBLE BLOCKER` return, is terminal",
        );
        expect(prompt).toContain("After emitting it, make no tool calls and emit no further text");
    });

    test("frontier treats FRONTIER ADVICE as a terminal return", () => {
        const prompt = loadSpecialistPrompt("frontier");
        expect(prompt).toContain("This advice block is terminal");
        expect(prompt).toContain("After emitting it, make no tool calls and emit no further text");
    });
});

describe("coordinator sync-flow contract", () => {
    test("loads the sync flow and its lifecycle invariants", () => {
        expectSyncFlowContract(loadPrompt(AGENT_IDS.coordinator));
    });

    test.each(["interactive", "auto"] as const)("%s coordinator includes the sync flow", mode => {
        expectSyncFlowContract(buildCoordinatorPrompt(mode, false));
    });
});

describe("engram ordering contract", () => {
    const ENGRAM_ROLES: Array<keyof typeof AGENT_IDS> = [
        "explorer",
        "planner",
        "designer",
        "implementer",
        "reviewer",
        "frontier",
    ];

    test("every specialist prompt orders Engram writes before the final handoff/verdict", () => {
        for (const role of ENGRAM_ROLES) {
            const prompt = loadSpecialistPrompt(role);
            expect(prompt).toContain(
                "Order every Engram write before your final SpecOps handoff or verdict",
            );
            expect(prompt).toContain("Never call an Engram tool after emitting your handoff");
        }
    });
});

describe("shared Engram policy invariants", () => {
    const PROMPTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "prompts");

    test("shared policy is included by every Engram-aware role and reaches assembled prompts", async () => {
        for (const file of ENGRAM_AWARE_SOURCE_FILES) {
            const source = await readFile(path.join(PROMPTS_DIR, file), "utf8");
            expect(source).toContain("{{include:shared/engram.md}}");
        }

        const shared = await readFile(path.join(PROMPTS_DIR, "shared", "engram.md"), "utf8");
        const sources = await Promise.all(
            readdirSync(PROMPTS_DIR, { recursive: true })
                .map((entry: unknown) => String(entry))
                .filter(entry => entry.endsWith(".md"))
                .map(async entry => readFile(path.join(PROMPTS_DIR, entry), "utf8")),
        );

        for (const anchor of SHARED_ENGRAM_POLICY_ANCHORS) {
            expect(shared).toContain(anchor);
            expect(
                sources.reduce((count, content) => count + (content.split(anchor).length - 1), 0),
            ).toBe(1);
            for (const file of ENGRAM_AWARE_SOURCE_FILES) {
                const source = await readFile(path.join(PROMPTS_DIR, file), "utf8");
                expect(source).not.toContain(anchor);
            }
        }

        for (const role of ENGRAM_AWARE_ROLES) {
            const prompt = loadSpecialistPrompt(role);
            for (const anchor of SHARED_ENGRAM_POLICY_ANCHORS) expect(prompt).toContain(anchor);
        }

        for (const mode of ["interactive", "auto"] as const) {
            const prompt = buildCoordinatorPrompt(mode, false);
            for (const anchor of SHARED_ENGRAM_POLICY_ANCHORS) expect(prompt).toContain(anchor);
        }
    });

    test("specialist prompts remain free of concrete memory tool names", () => {
        for (const role of ALL_SPECIALIST_ROLES) {
            expect(loadSpecialistPrompt(role)).not.toContain("mem_");
        }
    });

    test("review critics remain free of memory guidance", () => {
        for (const role of ["reviewCorrectness", "reviewRisk", "reviewQuality"] as const) {
            const prompt = loadSpecialistPrompt(role);
            expect(prompt).not.toContain("## Engram");
            expect(prompt).not.toContain("memory");
            expect(prompt).not.toContain("topic_key");
            expect(prompt).not.toContain("change/<change-name>");
        }
    });
});

describe("coordinator config-view migration (issue #39)", () => {
    const PROMPTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "prompts");

    test("no coordinator prompt file retains the maxAutoReviewIterations placeholder", async () => {
        const files = readdirSync(PROMPTS_DIR);
        const coordinatorFiles = files.filter((file: string) => file.startsWith("coordinator"));
        expect(coordinatorFiles.length).toBeGreaterThan(0);
        for (const file of coordinatorFiles) {
            const content = await readFile(path.join(PROMPTS_DIR, file), "utf8");
            expect(content).not.toContain("{{maxAutoReviewIterations}}");
        }
    });

    test("assembled coordinator prompts do not contain the placeholder", () => {
        for (const mode of ["interactive", "auto"] as const) {
            for (const frontier of [false, true]) {
                const prompt = buildCoordinatorPrompt(mode, frontier);
                expect(prompt).not.toContain("{{maxAutoReviewIterations}}");
            }
        }
    });

    test("every coordinator mode instructs reading maxSubagentConcurrency from specops_config", () => {
        // The shared coordinator prompt and both mode-specific prompts must
        // direct the LLM to read the effective concurrency value from the
        // config tool instead of leaving it as an opaque symbolic name.
        const shared = loadPrompt(AGENT_IDS.coordinator);
        expect(shared).toContain("specops_config");
        expect(shared).toContain("maxSubagentConcurrency");
        for (const mode of ["interactive", "auto"] as const) {
            const prompt = buildCoordinatorPrompt(mode, false);
            expect(prompt).toContain("from `specops_config` at workflow init");
        }
    });

    test("Auto prompt instructs reading the review budget from specops_config", () => {
        const prompt = buildCoordinatorPrompt("auto", false);
        expect(prompt).toContain("Read `maxAutoReviewIterations` from `specops_config`");
        expect(prompt).not.toContain("12 remediation rounds");
    });

    test("prompts directory exists at the expected packaged location", () => {
        expect(existsSync(PROMPTS_DIR)).toBe(true);
    });
});

describe("coordinator bash discipline contract", () => {
    test("shared coordinator prompt states the Bash boundary before startup", () => {
        const prompt = loadPrompt(AGENT_IDS.coordinator);

        expectBashDisciplineContract(prompt);
        expect(prompt.indexOf("## Bash discipline")).toBeLessThan(prompt.indexOf("## Startup"));
    });

    test.each(["interactive", "auto"] as const)(
        "%s coordinator inherits the Bash discipline contract",
        mode => {
            expectBashDisciplineContract(buildCoordinatorPrompt(mode, false));
        },
    );

    test("frontier-enabled Auto coordinator inherits the Bash discipline contract", () => {
        expectBashDisciplineContract(buildCoordinatorPrompt("auto", true));
    });
});

describe("shared coordinator contract fragments (issue #34)", () => {
    const PROMPTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "prompts");

    // Each extracted cross-mode contract is single-sourced in a shared fragment.
    // The anchor is wording unique to that contract so occurrence counting across
    // the prompts tree catches accidental re-duplication in a mode appendix.
    // `includers` lists the files that must carry the include directive: the two
    // mode appendices for mode-specific wiring, or the shared `coordinator.md`
    // base when the contract reaches every assembled prompt through the base.
    const MODE_APPENDICES = ["coordinator-interactive.md", "coordinator-auto.md"] as const;
    const SHARED_CONTRACTS = [
        {
            fragment: "conditional-explorer.md",
            anchor: "full scan if no Project Context capsule exists",
            includers: MODE_APPENDICES,
        },
        {
            fragment: "planning-batches.md",
            anchor: "wait for an entire wave to drain",
            includers: MODE_APPENDICES,
        },
        {
            fragment: "decision-envelope.md",
            anchor: "not exactly one Decision, not 2–4 options",
            includers: MODE_APPENDICES,
        },
        {
            fragment: "remediation-re-review.md",
            anchor: "do not summarize, paraphrase, renumber, or drop findings",
            includers: MODE_APPENDICES,
        },
        {
            fragment: "archive-safety.md",
            anchor: "never use a filesystem fallback",
            includers: MODE_APPENDICES,
        },
        {
            fragment: "background-dispatch.md",
            anchor: "Process exactly one injected completion per arrival",
            includers: ["coordinator.md"],
        },
        {
            fragment: "parallel-progress.md",
            anchor: "ephemeral reporting aid, never a routing, gating, approval, or archival authority",
            includers: ["coordinator.md"],
        },
    ] as const;

    function listPromptFiles(directory: string = PROMPTS_DIR): string[] {
        return readdirSync(directory, { recursive: true })
            .map((entry: unknown) => String(entry))
            .filter(entry => entry.endsWith(".md"))
            .map(entry => path.join(directory, entry));
    }

    test("every shared contract fragment is included by directive from its declared includers", async () => {
        for (const { fragment, includers } of SHARED_CONTRACTS) {
            for (const includer of includers) {
                const content = await readFile(path.join(PROMPTS_DIR, includer), "utf8");
                expect(content).toContain(`{{include:shared/${fragment}}}`);
            }
        }
    });

    test("extracted contracts stay single-source across the prompts tree", async () => {
        const contents = await Promise.all(
            listPromptFiles().map(async file => [file, await readFile(file, "utf8")] as const),
        );

        for (const { anchor } of SHARED_CONTRACTS) {
            const occurrences = contents.reduce(
                (count, [, content]) => count + content.split(anchor).length - 1,
                0,
            );
            expect(occurrences).toBe(1);
        }

        // The single occurrence must live in the shared fragment itself.
        for (const { fragment, anchor } of SHARED_CONTRACTS) {
            const content = await readFile(path.join(PROMPTS_DIR, "shared", fragment), "utf8");
            expect(content).toContain(anchor);
        }
    });

    test.each(["interactive", "auto"] as const)(
        "assembled %s coordinator exposes every shared contract",
        mode => {
            const prompt = buildCoordinatorPrompt(mode, false);
            for (const { anchor } of SHARED_CONTRACTS) {
                expect(prompt).toContain(anchor);
            }
        },
    );

    test("planning batches defer concurrent dispatch to the shared background contract", async () => {
        const content = await readFile(
            path.join(PROMPTS_DIR, "shared", "planning-batches.md"),
            "utf8",
        );
        expect(content).toContain(
            "Concurrent author dispatches follow the background dispatch contract",
        );
        // The contract reaches every assembled prompt through the coordinator
        // base; re-including it here would duplicate the contract text.
        expect(content).not.toContain("{{include:shared/background-dispatch.md}}");
    });

    test("parallel progress guidance names the read-only specops_progress tool", async () => {
        const content = await readFile(
            path.join(PROMPTS_DIR, "shared", "parallel-progress.md"),
            "utf8",
        );
        expect(content).toContain("specops_progress");
        expect(content).toContain("read-only");
    });
});

describe("fresh-change validation gate contract", () => {
    function validationGatesSection(prompt: string): string {
        const start = prompt.indexOf("## Validation gates");
        expect(start).toBeGreaterThanOrEqual(0);
        const end = prompt.indexOf("## ", start + 3);
        expect(end).toBeGreaterThan(start);
        return prompt.slice(start, end);
    }

    test("shared coordinator dispatches normally while first-pass deltas are pending", () => {
        const section = validationGatesSection(loadPrompt(AGENT_IDS.coordinator));
        expect(section).toContain('`action: "continue_planning"`');
        expect(section).toContain("dispatch normally");
        expect(section).toContain("do not emit `BLOCKED`");
        expect(section).toContain('`action: "block"`');
    });

    test.each(["interactive", "auto"] as const)(
        "%s coordinator keeps incomplete planning out of review",
        mode => {
            const section = validationGatesSection(buildCoordinatorPrompt(mode, false));
            expect(section).toContain("can never pass review");
            expect(section).toContain('`action: "continue_planning"`');
        },
    );

    test("planner skips validation until every required capability specification exists", () => {
        const prompt = loadSpecialistPrompt("planner");
        expect(prompt).toContain("do not run `openspec validate <change>`");
        expect(prompt).toContain('"no deltas found"');
        expect(prompt).toContain("expected mid-planning");
    });
});

describe("coordinator implementation-phase contract (scoped parallel implementer)", () => {
    // Anchor on newline-delimited headers: the routing bullet mentions the
    // section name as inline code, so a bare indexOf would match there first.
    function delimitedSection(prompt: string, startHeader: string, endHeader: string): string {
        const marker = `\n${startHeader}\n`;
        const start = prompt.indexOf(marker);
        expect(start).toBeGreaterThanOrEqual(0);
        const startOffset = start + 1;
        const end = prompt.indexOf(`\n${endHeader}\n`, startOffset);
        expect(end).toBeGreaterThan(startOffset);
        return prompt.slice(startOffset, end);
    }

    test.each(["interactive", "auto"] as const)(
        "%s coordinator composes the new Implementation phase section",
        mode => {
            const prompt = buildCoordinatorPrompt(mode, false);
            const section = delimitedSection(prompt, "## Implementation phase", "## Review phase");

            expect(section).toContain("Serial fallback (default)");
            expect(section).toContain("Scoped parallel dispatch");
            expect(section).toContain("Rolling refill");
            expect(section).toContain("Durable verification");
            expect(section).toContain("Suspension");
            expect(section).toContain("assignedTaskIds");
            expect(section).toContain(
                "`maxSubagentConcurrency` (read once from `specops_config` at workflow init; default 1)",
            );
            expect(section).toContain("Uncertainty always means serial");

            // Serial-default framing precedes the trigger list, and the final
            // serial trigger requires segregation plus wall-clock benefit.
            expect(section).toContain("Serial implementation is the normal choice");
            expect(section).toContain(
                "genuinely segregated groups whose concurrent implementation is likely to reduce total wall-clock time",
            );

            // The scoped-parallel branch carries the full segregation gate,
            // the ceiling-not-target statement, and MAY-consolidate.
            expect(section).toContain("genuinely segregated for implementation");
            expect(section).toContain("a meaningfully separate subsystem or write surface");
            expect(section).toContain(
                "positive evidence that concurrent lanes will reduce total wall-clock time",
            );
            expect(section).toContain("Dependency-independence alone is not sufficient");
            expect(section).toContain(
                "strict ceiling on available capacity, never a utilisation target",
            );
            expect(section).toContain("multiple related task groups to a single implementer");

            // Refill re-applies the same gate and leaves unjustified slots empty.
            expect(section).toContain(
                "Re-apply the same segregation and wall-clock-benefit gate on every refill",
            );
            expect(section).toContain("leave the slot empty and let the active siblings finish");

            // The old dependency-independence-only bar is removed.
            expect(section).not.toContain("only clearly independent, coherent task groups");

            // The routing bullet now points approval at the new section.
            expect(prompt).toContain("6. Approval → `## Implementation phase`");
        },
    );

    test.each(["interactive", "auto"] as const)(
        "%s coordinator documents optional lane-continuation affinity",
        mode => {
            const section = delimitedSection(
                buildCoordinatorPrompt(mode, false),
                "## Implementation phase",
                "## Review phase",
            );

            expect(section).toContain("Lane-continuation session reuse");
            expect(section).toContain(
                "affinity judgement finds a clear continuation of the same coherent lane under existing locality rules",
            );
            expect(section).toContain(
                "same subsystem/write surface, shared types/tests, low sibling overlap",
            );
            expect(section).toContain("Resume only after verified success");
            expect(section).toContain("genuinely different-lane work gets a fresh implementer");
            expect(section).toContain("Reuse is optional: fresh dispatch is always valid");
        },
    );

    test("resumed assignments require fresh canonical state and explicit task ids", () => {
        const section = delimitedSection(
            buildCoordinatorPrompt("interactive", false),
            "## Implementation phase",
            "## Review phase",
        );

        expect(section).toContain(
            "refresh `specops_apply_instructions` and fresh canonical status/task state",
        );
        expect(section).toContain("fresh apply-instruction context and fresh task state");
        expect(section).toContain(
            "a new explicit `assignedTaskIds` list containing only newly assigned unchecked tasks",
        );
        expect(section).toContain("`task_id` = latest recorded task id");
        expect(section).toContain("`background: true`");
        expect(section).toContain("a verified-successful return replaces the id");
    });

    test("enumerates every no-reuse safety boundary and refreshes state regardless of reuse", () => {
        const section = delimitedSection(
            buildCoordinatorPrompt("interactive", false),
            "## Implementation phase",
            "## Review phase",
        );

        for (const boundary of [
            "planning/design revision changing the lane's approved implementation",
            "material reconciliation affecting the lane",
            "unresolved overlap/dependency conflict involving the lane",
            "unrecovered malformed return (see the bounded `### Malformed or missing handoff return` recovery only)",
            "failed, errored, or incomplete prior session",
            "active change/run switch",
        ]) {
            expect(section).toContain(boundary);
        }
        expect(section).toContain(
            "on every dispatch regardless of reuse intent, refresh `specops_apply_instructions` and fresh canonical status/task state",
        );
        expect(section).toContain(
            "the bounded `### Malformed or missing handoff return` recovery only",
        );
        expect(section).toContain(
            "At initial scoped dispatch and each rolling refill, apply this six-step procedure",
        );
        for (const step of [
            "1. **Fresh canonical reads.**",
            "2. **Partition lanes.**",
            "3. **Validate scoped assignments.**",
            "4. **Apply the no-reuse gate.**",
            "5. **Make the affinity judgement.**",
            "6. **Dispatch.**",
        ]) {
            expect(section).toContain(step);
        }
    });

    test("documents single-attempt fallback, normal slot accounting, and no keep-alive work", () => {
        const section = delimitedSection(
            buildCoordinatorPrompt("interactive", false),
            "## Implementation phase",
            "## Review phase",
        );

        expect(section).toContain(
            "Attempt once; if unavailable or failing, immediately dispatch fresh for that assignment — no retry loop or blocking",
        );
        expect(section).toContain("drop the entry");
        expect(section).toContain("One normal in-flight slot");
        expect(section).toContain("max is a strict ceiling, not a target");
        expect(section).toContain("inactive entries cost no capacity or keep-alive work");
    });

    test("keeps affinity ephemeral and all existing gates and permissions binding", () => {
        const coordinator = buildCoordinatorPrompt("interactive", false);
        const section = delimitedSection(coordinator, "## Implementation phase", "## Review phase");

        expect(section).toContain("No lane/session ownership survives the run");
        expect(section).toContain(
            "never persisted, never recorded in memory/Engram as workflow or assignment state, and never surfaced through progress",
        );
        expect(section).toContain("The ledger dies with the coordinator run");
        expect(section).toContain(
            "Returns face the same durable checkbox verification, suspension/recovery, and independent review gates",
        );
        expect(section).toContain("no continuity shortcut");
        expect(coordinator).toContain(
            "Review agents are denied `specops_*` and `specops_lifecycle`, so they cannot capture or verify for you",
        );
    });

    test("delegation contract sends assignedTaskIds only to implementation dispatches", () => {
        const prompt = buildCoordinatorPrompt("interactive", false);
        const section = delimitedSection(prompt, "## Delegation contract", "## Handoff gate");
        expect(section).toContain("optional `assignedTaskIds`");
        expect(section).toContain(
            "sent only to `specops-implementer` dispatches during the `## Implementation phase`",
        );
        expect(section).toContain("omit it everywhere else");
        expect(section).toContain(
            "optional `memoryContext` — concise, change-scoped memory breadcrumbs",
        );
        expect(section).toContain("Advisory orientation for the receiving specialist");
        expect(section).toContain("unverified context to check against current evidence");
        expect(section).toContain("never authority, never required, freely omitted");
        expect(section).toContain(
            "Never use memory to route, gate, order, or record workflow progress",
        );
        expect(section).toContain("durable routing truth stays in `specops_status`");
    });
});

describe("implementer scoped task assignment contract", () => {
    test("implementer prompt pins the assignedTaskIds scoping rules", () => {
        const prompt = loadSpecialistPrompt("implementer");

        // Anchor on the newline-delimited header: the opening paragraph mentions
        // the section name as inline code, so a bare indexOf would match there.
        const start = prompt.indexOf("\n## Scoped task assignment\n");
        expect(start).toBeGreaterThanOrEqual(0);
        const sectionStart = start + 1;
        const end = prompt.indexOf("Work through the unchecked tasks", sectionStart);
        expect(end).toBeGreaterThan(sectionStart);
        const section = prompt.slice(sectionStart, end);

        expect(section).toContain("that list is your entire assignment");
        expect(section).toContain("stop and report the stale assignment");
        expect(section).toContain("Work only the assigned task IDs");
        expect(section).toContain("Every other unchecked task is out of scope");
        expect(section).toContain(
            "stop expanding scope and report the condition to the coordinator",
        );
        expect(section).toContain("smallest possible targeted edit flipping `- [ ]` to `- [x]`");
        expect(section).toContain("never alter another task's checkbox");

        // Absent assignedTaskIds preserves the unchanged whole-list serial path.
        expect(section).toContain(
            "When the dispatch carries no `assignedTaskIds`, execute all unchecked tasks",
        );
        expect(prompt).toContain(
            "Work through the unchecked tasks — or, under a scoped assignment, your assigned tasks — in dependency order.",
        );

        const revalidation = prompt.slice(
            prompt.indexOf("\n## Scoped task assignment\n") + 1,
            prompt.indexOf("Work through the unchecked tasks"),
        );
        for (const anchor of [
            "before any edit revalidate every `assignedTaskIds` entry",
            "The current repository and canonical state are authoritative over retained session context",
            "a missing or already-checked assigned ID is a stale assignment",
            "do not edit, return immediately reporting the mismatch",
            "regression as a material anomaly",
            "suspend and report it rather than silently re-executing the task",
            "disqualifies the session from further reuse until the anomaly is reconciled",
        ]) {
            expect(revalidation).toContain(anchor);
        }
    });
});
