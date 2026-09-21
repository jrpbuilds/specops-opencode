import { describe, expect, test } from "bun:test";
import type { Config } from "@opencode-ai/plugin";
import { PACKAGED_SKILLS_DIR } from "../../src/skills.js";
import { applySkills } from "../../src/host/skills.js";

describe("applySkills", () => {
    test("registers the packaged skills directory on a bare config", () => {
        const config: Config = {};
        applySkills(config);

        expect((config as { skills?: { paths?: string[] } }).skills?.paths).toEqual([
            PACKAGED_SKILLS_DIR,
        ]);
    });

    test("preserves user- and project-configured skill paths", () => {
        const config = {
            skills: {
                paths: ["/home/user/my-skills", ".opencode/skills"],
                urls: ["https://example.com/skills/"],
            },
        } as unknown as Config;
        applySkills(config);

        const skills = (config as { skills: { paths: string[]; urls?: string[] } }).skills;
        expect(skills.paths).toEqual([
            "/home/user/my-skills",
            ".opencode/skills",
            PACKAGED_SKILLS_DIR,
        ]);
        expect(skills.urls).toEqual(["https://example.com/skills/"]);
    });

    test("is idempotent across repeated registration", () => {
        const config: Config = {};
        applySkills(config);
        applySkills(config);

        expect((config as { skills?: { paths?: string[] } }).skills?.paths).toEqual([
            PACKAGED_SKILLS_DIR,
        ]);
    });

    test("skips registration when the directory does not exist", () => {
        const config: Config = {};
        applySkills(config, "/definitely/not/a/real/dir");

        expect((config as { skills?: unknown }).skills).toBeUndefined();
    });

    test("skips duplicate registration when the path is already configured", () => {
        const config = {
            skills: { paths: [PACKAGED_SKILLS_DIR, "/home/user/my-skills"] },
        } as unknown as Config;
        applySkills(config);

        expect((config as { skills: { paths: string[] } }).skills.paths).toEqual([
            PACKAGED_SKILLS_DIR,
            "/home/user/my-skills",
        ]);
    });
});
