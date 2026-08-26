import { describe, expect, mock, spyOn, test, afterEach } from "bun:test";
import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import * as helpers from "../../src/helpers.js";
import {
    captureBaseline,
    diffBaseline,
    enumerateOpenSpec,
    enumerateTracked,
    hashFile,
    isIgnored,
    resolveRepoRoot,
    verifyBaseline,
    type Baseline,
} from "../../src/coordinator/review-guard.js";
import { withTempDir } from "../helpers.js";

afterEach(() => {
    mock.restore();
});

/** Write files under the temp root, creating parent directories. */
async function writeFiles(root: string, relPaths: string[]): Promise<void> {
    for (const rel of relPaths) {
        const absolute = path.join(root, rel);
        await mkdir(path.dirname(absolute), { recursive: true });
        await writeFile(absolute, `content of ${rel}`);
    }
}

/** Create a change's OpenSpec tree under the temp root. */
async function writeOpenSpec(root: string, change: string): Promise<void> {
    const changeDir = path.join(root, "openspec", "changes", change);
    await mkdir(changeDir, { recursive: true });
    await writeFile(path.join(changeDir, "proposal.md"), "proposal body");
    await writeFile(path.join(changeDir, "tasks.md"), "- [ ] a task");
}

/** Mock the git CLI through the helpers capture dependency. */
function mockGit(root: string, getTracked: () => string[]): void {
    spyOn(helpers, "runCaptureStdout").mockImplementation(async (command, args, cwd) => {
        if (command !== "git") throw new Error(`unexpected command: ${command}`);
        if (cwd !== root) throw new Error(`unexpected cwd: ${cwd}`);
        if (args[0] === "rev-parse") return { stdout: root, exitCode: 0 };
        if (args[0] === "ls-files") return { stdout: getTracked().join("\n"), exitCode: 0 };
        throw new Error(`unexpected git args: ${args.join(" ")}`);
    });
}

describe("isIgnored", () => {
    test("excludes verification artifacts, logs, and the guard store", () => {
        expect(isIgnored("src/coordinator/review-guard.ts")).toBe(false);
        expect(isIgnored("openspec/changes/demo/proposal.md")).toBe(false);
        expect(isIgnored("dist/bundle.js")).toBe(true);
        expect(isIgnored("coverage/lcov.info")).toBe(true);
        expect(isIgnored("node_modules/pkg/index.js")).toBe(true);
        expect(isIgnored("src/nested/dist/output.ts")).toBe(true);
        expect(isIgnored("openspec/changes/demo/dist/notes.md")).toBe(true);
        expect(isIgnored("run.log")).toBe(true);
        expect(isIgnored("src/nested/run.log")).toBe(true);
        expect(isIgnored(".specops-review-guard/demo.json")).toBe(true);
    });
});

describe("hashFile", () => {
    test("matches the known SHA-256 digest of file contents", async () => {
        await withTempDir(async dir => {
            await writeFile(path.join(dir, "sample.txt"), "hello");
            await expect(hashFile(path.join(dir, "sample.txt"))).resolves.toBe(
                "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
            );
        });
    });

    test("hashes empty files as the empty-string digest", async () => {
        await withTempDir(async dir => {
            await writeFile(path.join(dir, "empty.txt"), "");
            await expect(hashFile(path.join(dir, "empty.txt"))).resolves.toBe(
                "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            );
        });
    });

    test("reads symlinked files through to their target content", async () => {
        await withTempDir(async dir => {
            await writeFile(path.join(dir, "target.txt"), "linked content");
            await symlink(path.join(dir, "target.txt"), path.join(dir, "alias.txt"));
            await expect(hashFile(path.join(dir, "alias.txt"))).resolves.toBe(
                await hashFile(path.join(dir, "target.txt")),
            );
        });
    });
});

describe("enumerateTracked", () => {
    test("hashes git-tracked files filtered by isIgnored", async () => {
        await withTempDir(async dir => {
            await writeFiles(dir, ["src/a.ts", "src/b.ts", "dist/bundle.js"]);
            mockGit(dir, () => ["src/a.ts", "src/b.ts", "dist/bundle.js"]);

            const tracked = await enumerateTracked(dir, helpers.runCaptureStdout);
            expect(Object.keys(tracked).sort()).toEqual(["src/a.ts", "src/b.ts"]);
            expect(tracked["src/a.ts"]).toBe(await hashFile(path.join(dir, "src/a.ts")));
        });
    });

    test("omits a tracked file missing from the worktree", async () => {
        await withTempDir(async dir => {
            await writeFiles(dir, ["src/a.ts"]);
            mockGit(dir, () => ["src/a.ts", "src/gone.ts"]);

            const tracked = await enumerateTracked(dir, helpers.runCaptureStdout);
            expect(Object.keys(tracked)).toEqual(["src/a.ts"]);
        });
    });
});

describe("enumerateOpenSpec", () => {
    test("walks the openspec tree, skipping symlinked directories and reading symlinked files", async () => {
        await withTempDir(async dir => {
            const changeDir = path.join(dir, "openspec", "changes", "demo");
            await mkdir(changeDir, { recursive: true });
            await writeFile(path.join(changeDir, "proposal.md"), "proposal");
            await mkdir(path.join(changeDir, "dist"), { recursive: true });
            await writeFile(path.join(changeDir, "dist", "notes.md"), "ignored");
            await writeFile(path.join(dir, "openspec", "linked.md"), "linked content");
            await symlink(
                path.join(dir, "openspec", "linked.md"),
                path.join(dir, "openspec", "alias.md"),
            );
            await mkdir(path.join(dir, "openspec", "real-dir"), { recursive: true });
            await writeFile(path.join(dir, "openspec", "real-dir", "inner.md"), "inner");
            await symlink(
                path.join(dir, "openspec", "real-dir"),
                path.join(dir, "openspec", "link-dir"),
            );

            const openspec = await enumerateOpenSpec(dir);
            expect(Object.keys(openspec).sort()).toEqual([
                "openspec/alias.md",
                "openspec/changes/demo/proposal.md",
                "openspec/linked.md",
                "openspec/real-dir/inner.md",
            ]);
            expect(openspec["openspec/alias.md"]).toBe(openspec["openspec/linked.md"]);
        });
    });

    test("returns an empty map when openspec is absent", async () => {
        await withTempDir(async dir => {
            await expect(enumerateOpenSpec(dir)).resolves.toEqual({});
        });
    });
});

describe("resolveRepoRoot", () => {
    test("uses git rev-parse --show-toplevel output when it succeeds", async () => {
        await withTempDir(async dir => {
            const git = spyOn(helpers, "runCaptureStdout").mockResolvedValue({
                stdout: "/repo/root",
                exitCode: 0,
            });

            await expect(resolveRepoRoot(dir, helpers.runCaptureStdout)).resolves.toBe(
                "/repo/root",
            );
            expect(git).toHaveBeenCalledWith("git", ["rev-parse", "--show-toplevel"], dir);
        });
    });

    test("falls back to the working directory when git fails", async () => {
        await withTempDir(async dir => {
            spyOn(helpers, "runCaptureStdout").mockResolvedValue({ stdout: "", exitCode: 128 });
            await expect(resolveRepoRoot(dir, helpers.runCaptureStdout)).resolves.toBe(dir);

            spyOn(helpers, "runCaptureStdout").mockRejectedValue(new Error("spawn failed"));
            await expect(resolveRepoRoot(dir, helpers.runCaptureStdout)).resolves.toBe(dir);
        });
    });
});

describe("diffBaseline", () => {
    const baseline: Baseline = {
        version: 1,
        change: "demo",
        root: "/repo",
        capturedAt: "2026-08-26T00:00:00.000Z",
        tracked: { "src/a.ts": "hash-a", "src/gone.ts": "hash-gone" },
        openspec: { "openspec/changes/demo/proposal.md": "hash-proposal" },
    };

    test("reports modified, added, and removed across the tracked scope", () => {
        const violations = diffBaseline(baseline, {
            tracked: { "src/a.ts": "hash-a-changed", "src/new.ts": "hash-new" },
            openspec: { "openspec/changes/demo/proposal.md": "hash-proposal" },
        });
        expect(violations).toEqual([
            {
                path: "src/a.ts",
                kind: "modified",
                scope: "tracked",
                baselineHash: "hash-a",
                currentHash: "hash-a-changed",
            },
            { path: "src/gone.ts", kind: "removed", scope: "tracked", baselineHash: "hash-gone" },
            { path: "src/new.ts", kind: "added", scope: "tracked", currentHash: "hash-new" },
        ]);
    });

    test("reports openspec-scoped mutations", () => {
        const violations = diffBaseline(baseline, {
            tracked: { "src/a.ts": "hash-a", "src/gone.ts": "hash-gone" },
            openspec: {},
        });
        expect(violations).toEqual([
            {
                path: "openspec/changes/demo/proposal.md",
                kind: "removed",
                scope: "openspec",
                baselineHash: "hash-proposal",
            },
        ]);
    });
});

describe("captureBaseline", () => {
    test("writes the baseline store with the expected shape", async () => {
        await withTempDir(async dir => {
            await writeFiles(dir, ["src/a.ts"]);
            await writeOpenSpec(dir, "demo");
            mockGit(dir, () => ["src/a.ts"]);

            const result = await captureBaseline("demo", dir, {
                capture: helpers.runCaptureStdout,
            });
            expect(result).toEqual({
                operation: "capture",
                change: "demo",
                root: dir,
                trackedCount: 1,
                openspecCount: 2,
            });

            const raw = await readFile(
                path.join(dir, ".specops-review-guard", "demo.json"),
                "utf8",
            );
            const baseline = JSON.parse(raw) as Baseline;
            expect(baseline.version).toBe(1);
            expect(baseline.change).toBe("demo");
            expect(baseline.root).toBe(dir);
            expect(typeof baseline.capturedAt).toBe("string");
            expect(Object.keys(baseline.tracked).sort()).toEqual(["src/a.ts"]);
            expect(Object.keys(baseline.openspec).sort()).toEqual([
                "openspec/changes/demo/proposal.md",
                "openspec/changes/demo/tasks.md",
            ]);
        });
    });
});

describe("review guard window", () => {
    test("detects a tracked-file mutation during the review window", async () => {
        await withTempDir(async dir => {
            const tracked = ["src/a.ts", "src/b.ts"];
            await writeFiles(dir, tracked);
            mockGit(dir, () => tracked);
            const deps = { capture: helpers.runCaptureStdout };

            await captureBaseline("demo", dir, deps);
            await writeFile(path.join(dir, "src/a.ts"), "mutated content");

            const result = await verifyBaseline("demo", dir, deps);
            expect(result.mutated).toBe(true);
            expect(result.missingBaseline).toBeUndefined();
            expect(result.violations).toHaveLength(1);
            expect(result.violations[0]).toMatchObject({
                path: "src/a.ts",
                kind: "modified",
                scope: "tracked",
            });
            expect(result.violations[0].baselineHash).not.toBe(result.violations[0].currentHash);
        });
    });

    test("detects an OpenSpec mutation during the review window", async () => {
        await withTempDir(async dir => {
            const tracked = ["src/a.ts"];
            await writeFiles(dir, tracked);
            await writeOpenSpec(dir, "demo");
            mockGit(dir, () => tracked);
            const deps = { capture: helpers.runCaptureStdout };

            await captureBaseline("demo", dir, deps);
            await writeFile(
                path.join(dir, "openspec", "changes", "demo", "proposal.md"),
                "mutated proposal",
            );

            const result = await verifyBaseline("demo", dir, deps);
            expect(result.mutated).toBe(true);
            expect(result.violations).toEqual([
                expect.objectContaining({
                    path: "openspec/changes/demo/proposal.md",
                    kind: "modified",
                    scope: "openspec",
                }),
            ]);
        });
    });

    test("passes a clean review with no false positives", async () => {
        await withTempDir(async dir => {
            const tracked = ["src/a.ts"];
            await writeFiles(dir, tracked);
            await writeOpenSpec(dir, "demo");
            mockGit(dir, () => tracked);
            const deps = { capture: helpers.runCaptureStdout };

            await captureBaseline("demo", dir, deps);
            const result = await verifyBaseline("demo", dir, deps);
            expect(result).toEqual({ mutated: false, violations: [] });
        });
    });

    test("does not report pre-existing dirty worktree state", async () => {
        await withTempDir(async dir => {
            const tracked = ["src/a.ts"];
            await writeFiles(dir, tracked);
            await writeFile(path.join(dir, "src/a.ts"), "implementer's uncommitted edit");
            mockGit(dir, () => tracked);
            const deps = { capture: helpers.runCaptureStdout };

            await captureBaseline("demo", dir, deps);
            const result = await verifyBaseline("demo", dir, deps);
            expect(result).toEqual({ mutated: false, violations: [] });
        });
    });

    test("detects a tracked file added during the window", async () => {
        await withTempDir(async dir => {
            const tracked = ["src/a.ts"];
            await writeFiles(dir, tracked);
            mockGit(dir, () => tracked);
            const deps = { capture: helpers.runCaptureStdout };

            await captureBaseline("demo", dir, deps);
            tracked.push("src/new.ts");
            await writeFiles(dir, ["src/new.ts"]);

            const result = await verifyBaseline("demo", dir, deps);
            expect(result.mutated).toBe(true);
            expect(result.violations).toEqual([
                expect.objectContaining({ path: "src/new.ts", kind: "added", scope: "tracked" }),
            ]);
        });
    });

    test("detects a tracked file removed during the window", async () => {
        await withTempDir(async dir => {
            const tracked = ["src/a.ts", "src/b.ts"];
            await writeFiles(dir, tracked);
            mockGit(dir, () => tracked);
            const deps = { capture: helpers.runCaptureStdout };

            await captureBaseline("demo", dir, deps);
            tracked.splice(tracked.indexOf("src/b.ts"), 1);

            const result = await verifyBaseline("demo", dir, deps);
            expect(result.mutated).toBe(true);
            expect(result.violations).toEqual([
                expect.objectContaining({ path: "src/b.ts", kind: "removed", scope: "tracked" }),
            ]);
        });
    });

    test("detects a tracked file deleted from the worktree during the window", async () => {
        await withTempDir(async dir => {
            const tracked = ["src/a.ts"];
            await writeFiles(dir, tracked);
            mockGit(dir, () => tracked);
            const deps = { capture: helpers.runCaptureStdout };

            await captureBaseline("demo", dir, deps);
            await rm(path.join(dir, "src/a.ts"));

            const result = await verifyBaseline("demo", dir, deps);
            expect(result.mutated).toBe(true);
            expect(result.violations).toEqual([
                expect.objectContaining({ path: "src/a.ts", kind: "removed", scope: "tracked" }),
            ]);
        });
    });

    test("excludes build artifacts and logs from the protected set", async () => {
        await withTempDir(async dir => {
            const tracked = ["src/a.ts", "dist/bundle.js", "coverage/lcov.info", "run.log"];
            await writeFiles(dir, tracked);
            mockGit(dir, () => tracked);
            const deps = { capture: helpers.runCaptureStdout };

            await captureBaseline("demo", dir, deps);
            const raw = await readFile(
                path.join(dir, ".specops-review-guard", "demo.json"),
                "utf8",
            );
            expect(Object.keys((JSON.parse(raw) as Baseline).tracked)).toEqual(["src/a.ts"]);

            await writeFile(path.join(dir, "dist", "bundle.js"), "rebuilt bundle");
            await writeFile(path.join(dir, "coverage", "lcov.info"), "new coverage");
            await writeFiles(dir, ["node_modules/pkg/index.js"]);
            await writeFile(path.join(dir, "run.log"), "logged output");

            const result = await verifyBaseline("demo", dir, deps);
            expect(result).toEqual({ mutated: false, violations: [] });
        });
    });

    test("excludes the guard's own baseline store from the protected set", async () => {
        await withTempDir(async dir => {
            const tracked = ["src/a.ts", ".specops-review-guard/demo.json"];
            await writeFiles(dir, ["src/a.ts"]);
            mockGit(dir, () => tracked);
            const deps = { capture: helpers.runCaptureStdout };

            await captureBaseline("demo", dir, deps);
            const raw = await readFile(
                path.join(dir, ".specops-review-guard", "demo.json"),
                "utf8",
            );
            expect(Object.keys((JSON.parse(raw) as Baseline).tracked)).toEqual(["src/a.ts"]);

            // Rewrite the store mid-window; verify must stay clean.
            await captureBaseline("demo", dir, deps);
            const result = await verifyBaseline("demo", dir, deps);
            expect(result).toEqual({ mutated: false, violations: [] });
        });
    });

    test("verify is idempotent against a single baseline", async () => {
        await withTempDir(async dir => {
            const tracked = ["src/a.ts"];
            await writeFiles(dir, tracked);
            mockGit(dir, () => tracked);
            const deps = { capture: helpers.runCaptureStdout };

            await captureBaseline("demo", dir, deps);
            const cleanFirst = await verifyBaseline("demo", dir, deps);
            const cleanSecond = await verifyBaseline("demo", dir, deps);
            expect(cleanFirst).toEqual({ mutated: false, violations: [] });
            expect(cleanSecond).toEqual(cleanFirst);

            await writeFile(path.join(dir, "src/a.ts"), "changed");
            const mutatedFirst = await verifyBaseline("demo", dir, deps);
            const mutatedSecond = await verifyBaseline("demo", dir, deps);
            expect(mutatedFirst.mutated).toBe(true);
            expect(mutatedSecond).toEqual(mutatedFirst);
        });
    });

    test("fails closed when no baseline exists", async () => {
        await withTempDir(async dir => {
            await writeFiles(dir, ["src/a.ts"]);
            mockGit(dir, () => ["src/a.ts"]);

            const result = await verifyBaseline("demo", dir, { capture: helpers.runCaptureStdout });
            expect(result).toEqual({ mutated: false, missingBaseline: true, violations: [] });
        });
    });

    test("fails closed when the stored baseline is not valid JSON", async () => {
        await withTempDir(async dir => {
            await writeFiles(dir, ["src/a.ts"]);
            mockGit(dir, () => ["src/a.ts"]);
            const deps = { capture: helpers.runCaptureStdout };

            await captureBaseline("demo", dir, deps);
            await writeFile(path.join(dir, ".specops-review-guard", "demo.json"), "not json");

            const result = await verifyBaseline("demo", dir, deps);
            expect(result).toEqual({ mutated: false, missingBaseline: true, violations: [] });
        });
    });

    test("fails closed when the stored baseline has an unusable shape", async () => {
        await withTempDir(async dir => {
            await writeFiles(dir, ["src/a.ts"]);
            mockGit(dir, () => ["src/a.ts"]);
            const deps = { capture: helpers.runCaptureStdout };

            await captureBaseline("demo", dir, deps);
            await writeFile(
                path.join(dir, ".specops-review-guard", "demo.json"),
                JSON.stringify({ version: 2, change: "demo", tracked: "not-a-map" }),
            );

            const result = await verifyBaseline("demo", dir, deps);
            expect(result).toEqual({ mutated: false, missingBaseline: true, violations: [] });
        });
    });
});
