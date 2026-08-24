import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { AGENT_IDS, ALL_AGENT_IDS, type AgentId } from "./agents/ids.js";
import { isRecord } from "./openspec/helpers.js";

/**
 * Model and optional reasoning variant selected for one role.
 *
 * A blank/absent `model` means "use OpenCode's configured global default".
 * `variant` is only meaningful when a `model` is set; a variant without a
 * model is rejected by {@link validateConfigSelections}.
 */
export type AgentConfig = { model?: string; variant?: string };

/**
 * The complete persisted SpecOps configuration.
 *
 * Validation fills role entries missing from older configuration files with
 * empty mappings; individual entries may omit `model` to inherit OpenCode's
 * global default. `frontierEscalation` is
 * normalized to `false`, and `maxSubagentConcurrency` (the maximum concurrently
 * active SpecOps specialist subagents) to `2`, when loading an older
 * configuration without those fields.
 */
export type SpecOpsConfig = {
    agents: Record<AgentId, AgentConfig>;
    frontierEscalation: boolean;
    maxSubagentConcurrency?: number;
};

/**
 * Initial configuration used when no SpecOps file exists.
 *
 * Every role is present with an empty entry so the default remains explicit
 * and satisfies the same shape enforced for persisted configuration.
 */
export const DEFAULT_CONFIG: SpecOpsConfig = {
    agents: Object.fromEntries(ALL_AGENT_IDS.map(id => [id, {}])) as SpecOpsConfig["agents"],
    frontierEscalation: false,
    maxSubagentConcurrency: 2,
};

const REVIEW_SPECIALIST_IDS = new Set<AgentId>([
    AGENT_IDS.reviewCorrectness,
    AGENT_IDS.reviewRisk,
    AGENT_IDS.reviewQuality,
]);

/** Return a non-blank configuration field, preserving its stored value. */
function nonBlank(value: string | undefined): string | undefined {
    return value?.trim() ? value : undefined;
}

/**
 * Resolve the effective model mapping for one role without changing persisted
 * configuration. A review specialist with its own model uses only its own
 * entry; one without a model inherits the reviewer's model and variant
 * together, keeping variants from leaking onto a different model. Every other
 * role uses its own stored entry unchanged.
 *
 * @param config Validated or draft SpecOps configuration.
 * @param roleId Role whose effective mapping is needed.
 * @returns A model/variant mapping suitable for host or editor display.
 */
export function resolveAgentMapping(config: SpecOpsConfig, roleId: AgentId): AgentConfig {
    const own = config.agents[roleId];
    if (!REVIEW_SPECIALIST_IDS.has(roleId)) return { ...own };

    const ownModel = nonBlank(own.model);
    if (ownModel) {
        const ownVariant = nonBlank(own.variant);
        return { model: ownModel, ...(ownVariant ? { variant: ownVariant } : {}) };
    }

    // No own model: inherit the reviewer's model and variant as one mapping so
    // model-specific variants are never applied to the specialist's own model.
    const reviewer = config.agents[AGENT_IDS.reviewer];
    const reviewerModel = nonBlank(reviewer.model);
    if (!reviewerModel) return {};

    const variant = nonBlank(own.variant) ?? nonBlank(reviewer.variant);
    return {
        model: reviewerModel,
        ...(variant ? { variant } : {}),
    };
}

/** Concurrency values accepted for concurrently active SpecOps specialist subagents. */
const ALLOWED_SUBAGENT_CONCURRENCY = new Set([1, 2, 4, 8]);

/**
 * Resolve the OpenCode configuration directory using the XDG convention.
 *
 * Explicit `XDG_CONFIG_HOME` values are honored; otherwise the supplied home
 * directory is used to make the path deterministic in tests.
 *
 * @param environment Environment variables used to resolve XDG configuration.
 * @param homeDirectory Fallback home directory when XDG is not set.
 * @returns The absolute path to OpenCode's configuration directory.
 */
function resolveOpenCodeConfigDirectory(
    environment: NodeJS.ProcessEnv = process.env,
    homeDirectory: string = os.homedir(),
): string {
    return environment.XDG_CONFIG_HOME
        ? path.join(environment.XDG_CONFIG_HOME, "opencode")
        : path.join(homeDirectory, ".config", "opencode");
}

/**
 * Resolve the location of the persisted SpecOps configuration file.
 *
 * The file lives below OpenCode's configuration directory so the plugin uses
 * the same per-user configuration boundary as the host application.
 *
 * @param environment Environment variables used to resolve XDG configuration.
 * @param homeDirectory Fallback home directory when XDG is not set.
 * @returns The absolute path to the persisted SpecOps configuration file.
 */
export function resolveConfigPath(
    environment: NodeJS.ProcessEnv = process.env,
    homeDirectory: string = os.homedir(),
): string {
    return path.join(resolveOpenCodeConfigDirectory(environment, homeDirectory), "specops.json");
}

/**
 * Load and validate persisted configuration, falling back to a fresh default
 * only when the file does not exist.
 *
 * Malformed or incompatible existing files are allowed to fail loudly rather
 * than being silently replaced.
 *
 * @param destination Configuration file to read.
 * @returns The validated configuration, including defaults for omitted fields.
 */
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

/**
 * Validate and clone the exact current SpecOps configuration shape.
 *
 * The validator rejects unknown top-level or role keys, invalid field types,
 * and non-blank variants without a valid model context. Role entries missing
 * from older configuration files are backfilled as empty inheriting mappings
 * so the file still loads and the editor can persist the full catalogue later.
 *
 * @param value Unknown parsed configuration value.
 * @returns A cloned, validated configuration with every role entry present.
 * @throws Error when the value is malformed or contains unsupported settings.
 */
export function validateConfig(value: unknown): SpecOpsConfig {
    if (
        !isRecord(value) ||
        !hasOnlyKeys(value, ["agents", "frontierEscalation", "maxSubagentConcurrency"]) ||
        !isRecord(value.agents)
    ) {
        throw new Error("invalid SpecOps configuration");
    }
    if ("frontierEscalation" in value && typeof value.frontierEscalation !== "boolean") {
        throw new Error("invalid SpecOps configuration frontierEscalation");
    }
    if (
        "maxSubagentConcurrency" in value &&
        (typeof value.maxSubagentConcurrency !== "number" ||
            !ALLOWED_SUBAGENT_CONCURRENCY.has(value.maxSubagentConcurrency))
    ) {
        throw new Error("maxSubagentConcurrency must be 1, 2, 4, or 8");
    }

    // Unknown role ids stay a hard error because they almost certainly name a
    // role this installation does not have; absent ids belong to older files.
    const entries = value.agents as Record<string, unknown>;
    const known = new Set<string>(ALL_AGENT_IDS);
    for (const id of Object.keys(entries)) {
        if (!known.has(id)) {
            throw new Error(
                "configuration agent catalogue does not match this SpecOps installation",
            );
        }
    }

    for (const id of ALL_AGENT_IDS) {
        const entry = entries[id];
        if (entry === undefined) continue;
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

    const config = {
        agents: Object.fromEntries(
            ALL_AGENT_IDS.map(id => [id, (entries[id] ?? {}) as AgentConfig]),
        ),
        frontierEscalation: value.frontierEscalation ?? false,
        maxSubagentConcurrency: value.maxSubagentConcurrency ?? 2,
    } as SpecOpsConfig;

    for (const id of ALL_AGENT_IDS) {
        const entry = config.agents[id];
        if (entry.variant?.trim() && !resolveAgentMapping(config, id).model) {
            throw new Error(`invalid SpecOps configuration entry: ${id}`);
        }
    }

    return structuredClone(config);
}

/**
 * Validate configuration and replace the destination atomically.
 *
 * Validation occurs before any write, while `writeFileAtomic` prevents a
 * partially written JSON file from becoming the active configuration.
 *
 * @param config Configuration to validate and persist.
 * @param destination Configuration file to replace.
 */
export async function saveConfig(
    config: SpecOpsConfig,
    destination: string = resolveConfigPath(),
): Promise<void> {
    const validated = validateConfig(config);
    await writeFileAtomic(destination, `${JSON.stringify(validated, null, 2)}\n`);
}

/**
 * Write UTF-8 content through a same-directory temporary file and rename.
 *
 * The temporary file is opened exclusively, flushed before replacement, and
 * cleaned up in both success and failure paths. Keeping it beside the target
 * preserves the filesystem's atomic rename guarantees.
 *
 * @param destination File to replace atomically.
 * @param content UTF-8 content to write.
 */
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

/**
 * Check that a record contains no keys outside the supplied allow-list.
 *
 * @param value Record whose keys should be checked.
 * @param allowed Keys accepted by the surrounding configuration shape.
 * @returns Whether every key is present in the allow-list.
 */
function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
    return Object.keys(value).every(key => allowed.includes(key));
}
