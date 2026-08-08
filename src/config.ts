import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ALL_AGENT_IDS, type AgentId } from "./agents.js";

/**
 * Model and optional reasoning variant selected for one role.
 *
 * A blank/absent `model` means "use OpenCode's configured global default".
 * `variant` is only meaningful when a `model` is set; a variant without a
 * model is rejected by {@link validateConfigSelections}.
 */
export type AgentConfig = { model?: string; variant?: string };

/** Persisted SpecOps configuration. */
export type SpecOpsConfig = { agents: Record<AgentId, AgentConfig> };

/** Default configuration delegates every role to OpenCode's global default. */
export const DEFAULT_CONFIG: SpecOpsConfig = {
    agents: Object.fromEntries(ALL_AGENT_IDS.map(id => [id, {}])) as SpecOpsConfig["agents"],
};

/** Resolve OpenCode's XDG-aware configuration directory. */
function resolveOpenCodeConfigDirectory(
    environment: NodeJS.ProcessEnv = process.env,
    homeDirectory: string = os.homedir(),
): string {
    return environment.XDG_CONFIG_HOME
        ? path.join(environment.XDG_CONFIG_HOME, "opencode")
        : path.join(homeDirectory, ".config", "opencode");
}

/** Resolve the global SpecOps configuration path. */
export function resolveConfigPath(
    environment: NodeJS.ProcessEnv = process.env,
    homeDirectory: string = os.homedir(),
): string {
    return path.join(resolveOpenCodeConfigDirectory(environment, homeDirectory), "specops.json");
}

/** Load the persisted configuration, or defaults when the file is absent. */
export async function loadConfig(
    destination: string = resolveConfigPath(),
): Promise<SpecOpsConfig> {
    try {
        return validateConfig(JSON.parse(await readFile(destination, "utf8")));
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return structuredClone(DEFAULT_CONFIG);
        }
        throw error;
    }
}

/** Validate the exact seven-role configuration shape. */
export function validateConfig(value: unknown): SpecOpsConfig {
    if (!isRecord(value) || !hasExactKeys(value, ["agents"]) || !isRecord(value.agents)) {
        throw new Error("invalid SpecOps configuration");
    }

    const expected = [...ALL_AGENT_IDS].sort();
    if (Object.keys(value.agents).sort().join("|") !== expected.join("|")) {
        throw new Error("configuration agent catalogue does not match this SpecOps installation");
    }

    for (const id of expected) {
        const entry = value.agents[id];
        if (!isRecord(entry) || !hasOnlyKeys(entry, ["model", "variant"])) {
            throw new Error(`invalid SpecOps configuration entry: ${id}`);
        }
        if (
            ("model" in entry && typeof entry.model !== "string") ||
            ("variant" in entry && (typeof entry.variant !== "string" || !entry.variant.trim()))
        ) {
            throw new Error(`invalid SpecOps configuration entry: ${id}`);
        }
    }

    return structuredClone(value) as SpecOpsConfig;
}

/** Validate then atomically replace the persisted configuration file. */
export async function saveConfig(
    config: SpecOpsConfig,
    destination: string = resolveConfigPath(),
): Promise<void> {
    const validated = validateConfig(config);
    await writeFileAtomic(destination, `${JSON.stringify(validated, null, 2)}\n`);
}

/** Write a complete UTF-8 file through a same-directory temp-file rename. */
export async function writeFileAtomic(destination: string, content: string): Promise<void> {
    await mkdir(path.dirname(destination), { recursive: true });
    const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
    const handle = await open(temporary, "wx");
    try {
        await handle.writeFile(content, "utf8");
        await handle.sync();
    } finally {
        await handle.close();
    }
    try {
        await rename(temporary, destination);
    } finally {
        await unlink(temporary).catch(() => undefined);
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
    return Object.keys(value).every(key => allowed.includes(key));
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
    return Object.keys(value).sort().join("|") === [...expected].sort().join("|");
}
