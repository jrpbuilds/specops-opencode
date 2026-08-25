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
    const SHARED_CONTRACTS = [
        {
            fragment: "conditional-explorer.md",
            anchor: "full scan if no Project Context capsule exists",
        },
        {
            fragment: "planning-batches.md",
            anchor: "wait for an entire wave to drain",
        },
        {
            fragment: "decision-envelope.md",
            anchor: "not exactly one Decision, not 2–4 options",
        },
        {
            fragment: "remediation-re-review.md",
            anchor: "do not summarize, paraphrase, renumber, or drop findings",
        },
        {
            fragment: "archive-safety.md",
            anchor: "never use a filesystem fallback",
        },
    ] as const;

    function listPromptFiles(directory: string = PROMPTS_DIR): string[] {
        return readdirSync(directory, { recursive: true })
            .map((entry: unknown) => String(entry))
            .filter(entry => entry.endsWith(".md"))
            .map(entry => path.join(directory, entry));
    }

    test("both mode appendices include every shared contract fragment by directive", async () => {
        for (const mode of ["coordinator-interactive.md", "coordinator-auto.md"]) {
            const content = await readFile(path.join(PROMPTS_DIR, mode), "utf8");
            for (const { fragment } of SHARED_CONTRACTS) {
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
});
