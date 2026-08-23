import { mkdtemp, readdir, readFile, rm, symlink } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "specops-v2-packed-"));

try {
    const packed = spawnSync("bun", ["pm", "pack", "--destination", temporaryRoot, "--quiet"], {
        cwd: root,
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
    await symlink(path.join(root, "node_modules"), path.join(packageDirectory, "node_modules"));
    process.env.XDG_CONFIG_HOME = path.join(temporaryRoot, "config");

    const server = await import(
        `${pathToFileURL(path.join(packageDirectory, "dist", "index.js")).href}?packed-v2`
    );
    const tui = await import(
        `${pathToFileURL(path.join(packageDirectory, "dist", "tui", "index.js")).href}?packed-v2-tui`
    );

    assert(server.default?.id === "specops", "packed server plugin id mismatch");
    assert(server.default?.tui === true, "packed server plugin must advertise TUI support");
    assert(typeof server.default?.setup === "function", "packed server setup missing");
    assert(tui.default?.id === "specops", "packed TUI plugin id mismatch");
    assert(typeof tui.default?.setup === "function", "packed TUI setup missing");

    const host = fakeHost();
    await server.default.setup(host.ctx);

    assertEqual(
        [...host.commands.keys()].sort(),
        ["specops", "specops-auto", "specops-doctor", "specops-onboard", "specops-sync", "specops-update"],
        "packed command catalogue",
    );
    assertEqual(
        [...host.tools.keys()].sort(),
        [
            "specops_archive",
            "specops_context",
            "specops_create_change",
            "specops_doctor",
            "specops_onboard",
            "specops_status",
            "specops_validate_change",
        ],
        "packed tool catalogue",
    );
    assertEqual(
        [...host.agents.keys()].filter(id => id !== "build").sort(),
        [
            "SpecOps",
            "SpecOps Auto",
            "specops-designer",
            "specops-explorer",
            "specops-implementer",
            "specops-planner",
            "specops-reviewer",
        ],
        "packed agent catalogue",
    );
    assert(host.agents.get("SpecOps").system.includes("# SpecOps Coordinator"), "coordinator system missing");
    assert(host.agents.get("specops-explorer").system.includes("# SpecOps Explorer"), "explorer system missing");

    let tuiLayer;
    tui.default.setup({
        keymap: {
            layer(factory) {
                tuiLayer = factory();
                return { dispose() {} };
            },
        },
    });
    assert(tuiLayer.commands[0].title === "SpecOps Configure", "packed TUI command missing");

    for (const prompt of ["coordinator.md", "explorer.md", "planner.md", "designer.md", "implementer.md", "reviewer.md"]) {
        assert(
            (await readFile(path.join(packageDirectory, "prompts", prompt), "utf8")).trim().length > 0,
            `packed prompt missing: ${prompt}`,
        );
    }

    process.stderr.write("OpenCode 2 packed install smoke passed\n");
} finally {
    await rm(temporaryRoot, { recursive: true, force: true });
}

function fakeHost() {
    const agents = new Map([["build", makeAgent("build")]]);
    const commands = new Map();
    const tools = new Map();
    const contextHooks = [];
    const ctx = {
        options: {},
        agent: {
            async transform(transform) {
                await transform({
                    list: () => [...agents.values()],
                    get: id => agents.get(id),
                    update(id, update) {
                        const item = agents.get(id) ?? makeAgent(id);
                        agents.set(id, item);
                        update(item);
                    },
                    remove: id => agents.delete(id),
                });
                return { async dispose() {} };
            },
            async get({ agentID }) {
                return {
                    location: { directory: packageDirectory, project: { id: "p", directory: packageDirectory, canonical: packageDirectory } },
                    data: agents.get(String(agentID)) ?? makeAgent(String(agentID)),
                };
            },
        },
        command: {
            async transform(transform) {
                await transform({
                    list: () => [...commands.values()],
                    get: name => commands.get(name),
                    update(name, update) {
                        const item = commands.get(name) ?? { name, template: "" };
                        commands.set(name, item);
                        update(item);
                    },
                    remove: name => commands.delete(name),
                });
                return { async dispose() {} };
            },
        },
        tool: {
            async transform(transform) {
                await transform({
                    list: () => [...tools.values()],
                    get: name => tools.get(name),
                    add(definition) {
                        tools.set(definition.name, definition);
                    },
                    remove: name => tools.delete(name),
                });
                return { async dispose() {} };
            },
        },
        session: {
            async hook(name, hook) {
                if (name === "context") contextHooks.push(hook);
                return { async dispose() {} };
            },
            async get({ sessionID }) {
                return { id: sessionID, agent: "build", location: { directory: packageDirectory } };
            },
        },
    };
    return { ctx, agents, commands, tools, contextHooks };
}

function makeAgent(id) {
    return { id, name: id, mode: "primary", hidden: false, permissions: [] };
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
    if (result.status !== 0) throw new Error(`${label} failed: ${result.stderr || result.stdout}`);
}
