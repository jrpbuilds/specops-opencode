import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import { resolveIncludes } from "../src/prompts.js";

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
