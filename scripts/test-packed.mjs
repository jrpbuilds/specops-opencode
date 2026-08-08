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
        `${pathToFileURL(path.join(packageDirectory, "dist", "tui.js")).href}?packed-test-tui`
    );
    assert(typeof tuiModule.default.tui === "function", "packed TUI entry is not loadable");
    const hooks = await module.default.server(pluginInput(packageDirectory));
    const config = {};
    await hooks.config(config);

    assertEqual(
        Object.keys(config.command).sort(),
        ["specops", "specops-doctor", "specops-onboard"],
        "packed command catalogue",
    );
    assert(config.command.specops.agent === "SpecOps", "specops command agent mismatch");
    assert(config.command.specops.template === "$ARGUMENTS", "specops command template mismatch");
    assertEqual(
        Object.keys(hooks.tool).sort(),
        ["specops_doctor", "specops_onboard"],
        "packed tool catalogue",
    );
    assertEqual(Object.keys(config.agent ?? {}).sort(), ["SpecOps"], "packed agent catalogue");
    assert(
        (await readFile(path.join(packageDirectory, "dist", "tui.js"), "utf8")).includes(
            "SpecOps Configure",
        ),
        "packed TUI entry missing",
    );

    process.stderr.write("Packed install smoke passed\n");
} finally {
    await rm(temporaryRoot, { recursive: true, force: true });
}

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

function assert(value, message) {
    if (!value) throw new Error(message);
}

function assertEqual(actual, expected, label) {
    if (actual.join("|") !== expected.join("|")) {
        throw new Error(`${label} mismatch: ${actual.join(", ")}`);
    }
}

function assertProcess(result, label) {
    if (result.status !== 0) {
        throw new Error(`${label} failed: ${result.stderr || result.stdout}`);
    }
}
