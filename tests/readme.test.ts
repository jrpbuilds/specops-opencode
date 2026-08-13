import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const readme = readFileSync(path.join(process.cwd(), "README.md"), "utf8");
const gettingStarted = readme.slice(
    readme.indexOf("## Getting started"),
    readme.indexOf("## Model configuration"),
);

describe("README", () => {
    test("documents Engram as optional recommended MCP-based historical memory", () => {
        expect(readme).toContain("https://github.com/Gentleman-Programming/engram");
        expect(readme).toContain("optional and recommended, not required");
        expect(readme).toContain('"command": ["engram", "mcp"]');
        expect(readme).toContain("MCP-only, recommended for SpecOps");
        expect(readme).toContain("OpenSpec remains the sole durable source of truth");
        expect(readme).toContain("SpecOps continues exactly as it does without it");
    });

    test("getting started no longer requires manual onboarding before /specops", () => {
        expect(gettingStarted).toContain("SpecOps self-onboards the project for OpenSpec");
        expect(gettingStarted).toContain("/specops-onboard");
        expect(gettingStarted).not.toContain(
            "This initialises the project for OpenSpec without installing OpenSpec's own OpenCode commands or skills.",
        );
    });
});
