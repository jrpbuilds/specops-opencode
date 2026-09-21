import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import { PACKAGED_SKILLS_DIR } from "../src/skills.js";

/** Frontmatter fields every packaged skill must carry. */
type SkillFrontmatter = {
    name?: unknown;
    description?: unknown;
};

/** The canonical packaged skill catalogue. Adding a skill means updating this. */
const PACKAGED_SKILL_NAMES = ["specops-example"] as const;

/** OpenCode's skill name rule: lowercase kebab-case, single hyphen separators. */
const SKILL_NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** OpenCode's documented description ceiling; longer descriptions are rejected. */
const MAX_DESCRIPTION_LENGTH = 1024;

function readSkillFile(skillName: string): { frontmatter: SkillFrontmatter; body: string } {
    const raw = readFileSync(path.join(PACKAGED_SKILLS_DIR, skillName, "SKILL.md"), "utf8");
    const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
    expect(match, `${skillName}/SKILL.md must start with YAML frontmatter`).toBeTruthy();
    const [, source, body] = match as RegExpMatchArray;
    return { frontmatter: Bun.YAML.parse(source) as SkillFrontmatter, body };
}

function packagedSkillNames(): string[] {
    return readdirSync(PACKAGED_SKILLS_DIR)
        .filter(entry => statSync(path.join(PACKAGED_SKILLS_DIR, entry)).isDirectory())
        .sort();
}

describe("packaged skills", () => {
    test("ships the canonical catalogue", () => {
        expect(packagedSkillNames()).toEqual([...PACKAGED_SKILL_NAMES].sort());
    });

    test("every skill folder contains a SKILL.md", () => {
        for (const name of packagedSkillNames()) {
            expect(
                statSync(path.join(PACKAGED_SKILLS_DIR, name, "SKILL.md"), {
                    throwIfNoEntry: false,
                })?.isFile(),
                `${name}/SKILL.md is missing`,
            ).toBe(true);
        }
    });

    test("every skill satisfies OpenCode's discovery contract", () => {
        for (const name of packagedSkillNames()) {
            // OpenCode only lists skills whose frontmatter name matches the
            // containing folder, so drift here silently hides the skill.
            const { frontmatter, body } = readSkillFile(name);
            expect(typeof frontmatter.name, `${name} frontmatter name must be a string`).toBe(
                "string",
            );
            expect(frontmatter.name, `${name} frontmatter name must match its folder`).toBe(name);
            expect(SKILL_NAME_PATTERN.test(name), `${name} must be kebab-case`).toBe(true);
            expect(name.startsWith("specops-"), `${name} must carry the specops- prefix`).toBe(
                true,
            );
            expect(
                name.length,
                `${name} must stay within OpenCode's 64-character limit`,
            ).toBeLessThanOrEqual(64);

            // OpenCode filters skills without descriptions out of the listing,
            // so a missing description makes the skill undiscoverable.
            expect(typeof frontmatter.description, `${name} description must be a string`).toBe(
                "string",
            );
            const description = (frontmatter.description as string).trim();
            expect(description.length, `${name} description must not be empty`).toBeGreaterThan(0);
            expect(
                description.length,
                `${name} description must stay within OpenCode's limit`,
            ).toBeLessThanOrEqual(MAX_DESCRIPTION_LENGTH);

            expect(body.trim().length, `${name} body must not be empty`).toBeGreaterThan(0);
        }
    });
});
