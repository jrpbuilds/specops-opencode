import { mkdtemp, readdir, readFile, rm, symlink } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "specops-packed-"));

try {
    const packed = spawnSync("bun", ["pm", "pack", "--destination", temporaryRoot, "--quiet"], {
        cwd: repositoryRoot,
        encoding: "utf8",
    });
    assertProcess(packed, "bun pm pack");

    const archiveName = (await readdir(temporaryRoot)).find(file => file.endsWith(".tgz"));
    assert(archiveName, "package archive missing");
    assertProcess(
        spawnSync("tar", ["-xzf", path.join(temporaryRoot, archiveName), "-C", temporaryRoot], {
            encoding: "utf8",
        }),
        "tar extraction",
    );

    const packageDirectory = path.join(temporaryRoot, "package");
    await symlink(
        path.join(repositoryRoot, "node_modules"),
        path.join(packageDirectory, "node_modules"),
    );
    process.env.XDG_CONFIG_HOME = path.join(temporaryRoot, "config");

    const module = await import(
        `${pathToFileURL(path.join(packageDirectory, "dist", "index.js")).href}?packed-test`
    );
    const tuiModule = await import(
        `${pathToFileURL(path.join(packageDirectory, "dist", "tui", "index.js")).href}?packed-test-tui`
    );
    assert(typeof tuiModule.default.tui === "function", "packed TUI entry is not loadable");
    const hooks = await module.default.server(pluginInput(packageDirectory));
    const config = {};
    await hooks.config(config);

    assert(typeof hooks["tool.execute.before"] === "function", "packed todo sync hook is missing");
    assertEqual(
        Object.keys(config.command).sort(),
        [
            "specops",
            "specops-auto",
            "specops-doctor",
            "specops-onboard",
            "specops-sync",
            "specops-update",
        ],
        "packed command catalogue",
    );
    assert(config.command.specops.agent === "SpecOps", "specops command agent mismatch");
    assert(config.command.specops.template === "$ARGUMENTS", "specops command template mismatch");
    assert(
        config.command["specops-auto"].agent === "SpecOps Auto",
        "specops-auto command agent mismatch",
    );
    assert(
        config.command["specops-auto"].template === "$ARGUMENTS",
        "specops-auto command template mismatch",
    );
    assert(
        config.command["specops-update"].agent === "SpecOps",
        "specops-update command agent mismatch",
    );
    assert(
        config.command["specops-update"].template === "$ARGUMENTS",
        "specops-update command template mismatch",
    );
    assert(
        config.command["specops-sync"].agent === "SpecOps",
        "specops-sync command agent mismatch",
    );
    assert(
        config.command["specops-sync"].template === "$ARGUMENTS",
        "specops-sync command template mismatch",
    );
    assertEqual(
        Object.keys(hooks.tool).sort(),
        [
            "specops_apply_instructions",
            "specops_archive",
            "specops_archive_instructions",
            "specops_config",
            "specops_context",
            "specops_create_change",
            "specops_doctor",
            "specops_onboard",
            "specops_progress",
            "specops_review_guard",
            "specops_status",
            "specops_validate_change",
        ],
        "packed tool catalogue",
    );
    assertEqual(
        Object.keys(config.agent ?? {}).sort(),
        [
            "SpecOps",
            "SpecOps Auto",
            "specops-designer",
            "specops-explorer",
            "specops-implementer",
            "specops-planner",
            "specops-review-correctness",
            "specops-review-quality",
            "specops-review-risk",
            "specops-reviewer",
        ],
        "packed agent catalogue",
    );
    assert(
        (await readFile(path.join(packageDirectory, "dist", "tui", "index.js"), "utf8")).includes(
            "SpecOps Configure",
        ),
        "packed TUI entry missing",
    );
    assert(
        (await readFile(path.join(packageDirectory, "prompts", "orchestrator.md"), "utf8"))
            .trim()
            .startsWith("# SpecOps Orchestrator"),
        "packed orchestrator prompt missing or malformed",
    );
    assert(
        (await readFile(path.join(packageDirectory, "prompts", "explorer.md"), "utf8"))
            .trim()
            .startsWith("# SpecOps Explorer"),
        "packed explorer prompt missing or malformed",
    );
    assert(
        (await readFile(path.join(packageDirectory, "prompts", "planner.md"), "utf8"))
            .trim()
            .startsWith("# SpecOps Planner"),
        "packed planner prompt missing or malformed",
    );
    assert(
        (await readFile(path.join(packageDirectory, "prompts", "designer.md"), "utf8"))
            .trim()
            .startsWith("# SpecOps Designer"),
        "packed designer prompt missing or malformed",
    );
    assert(
        (await readFile(path.join(packageDirectory, "prompts", "implementer.md"), "utf8"))
            .trim()
            .startsWith("# SpecOps Implementer"),
        "packed implementer prompt missing or malformed",
    );
    assert(
        (await readFile(path.join(packageDirectory, "prompts", "reviewer.md"), "utf8"))
            .trim()
            .startsWith("# SpecOps Reviewer"),
        "packed reviewer prompt missing or malformed",
    );
    const sourceFragments = (await readdir(path.join(repositoryRoot, "prompts", "shared")))
        .filter(file => file.endsWith(".md"))
        .sort();
    const packedFragments = (await readdir(path.join(packageDirectory, "prompts", "shared")))
        .filter(file => file.endsWith(".md"))
        .sort();
    assertEqual(packedFragments, sourceFragments, "packed shared prompt fragment catalogue");
    for (const fragment of sourceFragments) {
        assert(
            (
                await readFile(path.join(packageDirectory, "prompts", "shared", fragment), "utf8")
            ).trim().length > 0,
            `packed shared prompt fragment missing or empty: ${fragment}`,
        );
    }

    // Packaged skills are required runtime assets: the tree ships beside the
    // prompts, the config hook registers it through OpenCode's native
    // `skills.paths` discovery, and every packaged SKILL.md satisfies the
    // discovery contract (name matches its folder, description present).
    const packedSkillNames = (
        await readdir(path.join(packageDirectory, "skills"), {
            withFileTypes: true,
        })
    )
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
        .sort();
    assertEqual(
        packedSkillNames,
        [
            "specops-backend-engineering",
            "specops-database-engineering",
            "specops-example",
            "specops-frontend-engineering",
            "specops-security-engineering",
            "specops-testing",
        ],
        "packed skill catalogue",
    );
    assert(
        (await readFile(path.join(packageDirectory, "skills", "README.md"), "utf8")).trim().length >
            0,
        "packed skills README missing or empty",
    );
    const packedSkillPaths = config.skills?.paths ?? [];
    assert(
        packedSkillPaths.includes(path.join(packageDirectory, "skills")),
        `config hook did not register the packed skills directory: ${packedSkillPaths.join(", ")}`,
    );
    for (const skillName of packedSkillNames) {
        const raw = await readFile(
            path.join(packageDirectory, "skills", skillName, "SKILL.md"),
            "utf8",
        );
        const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
        assert(frontmatter, `packed skill ${skillName} has no YAML frontmatter`);
        const parsed = Bun.YAML.parse(frontmatter[1]);
        assert(parsed && parsed.name === skillName, `packed skill ${skillName} name mismatch`);
        assert(
            skillName.length <= 64,
            `packed skill ${skillName} name exceeds OpenCode's 64-character limit`,
        );
        assert(
            typeof parsed.description === "string" && parsed.description.trim().length > 0,
            `packed skill ${skillName} has no usable description`,
        );
        assert(
            raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trim().length > 0,
            `packed skill ${skillName} body is empty`,
        );
    }
    assert(
        typeof config.agent["SpecOps"].prompt === "string" &&
            config.agent["SpecOps"].prompt.length > 0,
        "orchestrator prompt not loaded in packed install",
    );
    assert(
        config.agent["SpecOps"].prompt.includes("## Engram"),
        "packed orchestrator prompt did not resolve shared Engram fragment",
    );
    assert(
        typeof config.agent["specops-explorer"].prompt === "string" &&
            config.agent["specops-explorer"].prompt.length > 0,
        "explorer prompt not loaded in packed install",
    );
    assert(
        typeof config.agent["specops-planner"].prompt === "string" &&
            config.agent["specops-planner"].prompt.length > 0,
        "planner prompt not loaded in packed install",
    );
    assert(
        typeof config.agent["specops-designer"].prompt === "string" &&
            config.agent["specops-designer"].prompt.length > 0,
        "designer prompt not loaded in packed install",
    );
    assert(
        typeof config.agent["specops-implementer"].prompt === "string" &&
            config.agent["specops-implementer"].prompt.length > 0,
        "implementer prompt not loaded in packed install",
    );
    assert(
        typeof config.agent["specops-reviewer"].prompt === "string" &&
            config.agent["specops-reviewer"].prompt.length > 0,
        "reviewer prompt not loaded in packed install",
    );

    // Interactive boundary: the SpecOps agent keeps the question permission allowed.
    assert(
        config.agent["SpecOps"].permission?.question === "allow",
        "packed interactive question permission",
    );
    assert(
        !config.agent["SpecOps"].prompt.includes("## Autonomous operation"),
        "packed interactive prompt must not carry the autonomous appendix",
    );

    // Autonomous boundary: the SpecOps Auto agent denies the question permission and appends
    // the autonomous policy to the shared orchestrator prompt.
    assert(
        config.agent["SpecOps Auto"].permission?.question === "deny",
        "packed auto question permission",
    );
    assert(
        config.agent["SpecOps Auto"].prompt.includes("## Autonomous operation (SpecOps Auto)") &&
            config.agent["SpecOps Auto"].prompt.includes("## Routing from canonical status"),
        "packed auto prompt missing autonomous appendix or shared workflow",
    );
    assert(
        !config.agent["SpecOps Auto"].prompt.includes("{{AUTO_MODE_STATE}}"),
        "packed auto prompt contains a stale placeholder",
    );

    process.stderr.write("Packed install smoke passed\n");
} finally {
    await rm(temporaryRoot, { recursive: true, force: true });
}

/**
 * Build a minimal plugin input fixture for the packed smoke test.
 *
 * All fields except `directory` are stubs: the `worktree`/`project`/`client`
 * objects are empty, `serverUrl` is a dummy URL, and `$` and
 * `experimental_workspace.register` are no-ops — just enough to satisfy the
 * plugin's `Plugin` signature without a real OpenCode runtime, so the test
 * can assert prompt composition and agent registration.
 */
function pluginInput(directory) {
    return {
        directory,
        worktree: directory,
        project: {},
        client: {},
        serverUrl: new URL("http://127.0.0.1"),
        $() {},
        experimental_workspace: { register() {} },
    };
}

/** Fail the smoke test when a condition does not hold. */
function assert(value, message) {
    if (!value) throw new Error(message);
}

/** Compare string arrays order-sensitively with a labelled failure. */
function assertEqual(actual, expected, label) {
    if (actual.join("|") !== expected.join("|")) {
        throw new Error(`${label} mismatch: ${actual.join(", ")}`);
    }
}

/** Fail when a spawned helper process exits nonzero. */
function assertProcess(result, label) {
    if (result.status !== 0) {
        throw new Error(`${label} failed: ${result.stderr || result.stdout}`);
    }
}
