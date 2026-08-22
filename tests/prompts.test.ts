import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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
