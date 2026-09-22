import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import { AGENT_IDS } from "../src/agents/ids.js";
import { PACKAGED_SKILLS_DIR } from "../src/skills.js";

/** Frontmatter fields every packaged skill must carry. */
type SkillFrontmatter = {
    name?: unknown;
    description?: unknown;
};

/** The canonical packaged skill catalogue. Adding a skill means updating this. */
const PACKAGED_SKILL_NAMES = [
    "specops-accessibility-review",
    "specops-backend-engineering",
    "specops-backend-review",
    "specops-browser-verification",
    "specops-compatibility-review",
    "specops-database-engineering",
    "specops-database-review",
    "specops-example",
    "specops-frontend-engineering",
    "specops-frontend-review",
    "specops-performance-review",
    "specops-security-engineering",
    "specops-security-review",
    "specops-testing",
] as const;

/** OpenCode's skill name rule: lowercase kebab-case, single hyphen separators. */
const SKILL_NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** OpenCode's documented description ceiling; longer descriptions are rejected. */
const MAX_DESCRIPTION_LENGTH = 1024;

/** Lifecycle tools belong to the runtime, never to a specialist capability. */
const LIFECYCLE_TOOL_NAMES = [
    "specops_archive",
    "specops_create_change",
    "specops_progress",
    "specops_review_guard",
    "specops_status",
    "specops_validate_change",
];

/** Verdict tokens belong to the reviewer contract, never to a skill body. */
const REVIEW_VERDICT_PATTERN = /\b(?:PASS|FAIL)\b/;

/** Review output and remediation labels belong to the review contracts. */
const REVIEW_CONTRACT_MARKERS = [
    { text: "blocking candidate", source: "shared/critic-evidence.md" },
    { text: "### REVIEW COVERAGE", source: "shared/critic-evidence.md" },
    { text: "### FINDINGS", source: "shared/critic-evidence.md" },
    { text: "Correction direction", source: "shared/critic-evidence.md" },
    { text: "Correction target", source: "reviewer.md" },
    { text: "Specialist disposition", source: "reviewer.md" },
] as const;

const SPECOPS_AGENT_IDS = Object.values(AGENT_IDS);
const PROMPTS_DIR = path.resolve(PACKAGED_SKILLS_DIR, "..", "prompts");

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

    test("skills do not carry SpecOps lifecycle tools", () => {
        for (const name of packagedSkillNames()) {
            const { body } = readSkillFile(name);
            for (const toolName of LIFECYCLE_TOOL_NAMES) {
                expect(body, `${name} must not name the ${toolName} lifecycle tool`).not.toContain(
                    toolName,
                );
            }
        }
    });

    test("skills do not emit review verdict language", () => {
        for (const name of packagedSkillNames()) {
            const { body } = readSkillFile(name);
            expect(body, `${name} must not emit reviewer verdict tokens`).not.toMatch(
                REVIEW_VERDICT_PATTERN,
            );
        }
    });

    test("skills do not template review reports or remediation routing", () => {
        for (const name of packagedSkillNames()) {
            const { body } = readSkillFile(name);
            for (const { text } of REVIEW_CONTRACT_MARKERS) {
                expect(
                    body,
                    `${name} must not carry the review contract marker '${text}'`,
                ).not.toContain(text);
            }
        }
    });

    test("skills do not name SpecOps agent roles", () => {
        for (const name of packagedSkillNames()) {
            const { body } = readSkillFile(name);
            for (const agentId of SPECOPS_AGENT_IDS) {
                expect(body, `${name} must not name the ${agentId} runtime role`).not.toContain(
                    agentId,
                );
            }
        }
    });

    test("review authority markers stay aligned with their contracts", () => {
        for (const { text, source } of REVIEW_CONTRACT_MARKERS) {
            const contract = readFileSync(path.join(PROMPTS_DIR, source), "utf8");
            expect(
                contract,
                `review authority marker '${text}' moved; update the skill guard and its source mapping`,
            ).toContain(text);
        }

        const reviewerContract = readFileSync(path.join(PROMPTS_DIR, "reviewer.md"), "utf8");
        for (const verdict of ["PASS", "FAIL"]) {
            expect(
                reviewerContract,
                `review verdict '${verdict}' moved; update the skill guard in lockstep`,
            ).toMatch(new RegExp(`^${verdict}$`, "m"));
        }
    });
});
