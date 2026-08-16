import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const readme = readFileSync(path.join(process.cwd(), "README.md"), "utf8");
const gettingStarted = readme.slice(
    readme.indexOf("## Getting started"),
    readme.indexOf("## Model configuration"),
);

describe("README", () => {
    test("documents Engram as an optional companion and not an artifact store", () => {
        expect(readme).toContain("https://github.com/Gentleman-Programming/engram");
        expect(readme).toContain("SpecOps works without Engram");
        expect(readme).toContain("docs/AGENT-SETUP.md");
        expect(readme).toContain("Engram is contextual memory only");
        expect(readme).toContain(
            "Current user instructions, OpenSpec artifacts, repository state, and executed evidence always take precedence",
        );
        expect(readme).not.toContain("Stage 1 is read-only");
        expect(readme).not.toContain('"command": ["engram", "mcp"]');
        expect(readme).not.toContain("MCP-only, recommended for SpecOps");
    });

    test("getting started no longer requires manual onboarding before /specops", () => {
        expect(gettingStarted).toContain("SpecOps automatically initialises OpenSpec on first use");
        expect(gettingStarted).toContain("/specops-onboard");
        expect(gettingStarted).not.toContain(
            "This initialises the project for OpenSpec without installing OpenSpec's own OpenCode commands or skills.",
        );
    });
});
