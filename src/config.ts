import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { AGENT_IDS, ALL_AGENT_IDS, type AgentId } from "./agents/ids.js";
import { isRecord } from "./openspec/helpers.js";
import { resolveAgentMapping } from "./models.js";

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
 * global default. `frontierEscalation`, `maxSubagentConcurrency`, and
 * `maxAutoReviewIterations` are always present after validation, normalized to
 * `false`, `1`, and `3` respectively when loading an older configuration
 * without those fields. `implementerFanout` and `reviewFanout` normalize to
 * `auto` when loading an older configuration without those fields.
 */
export type SpecOpsConfig = {
    agents: Record<AgentId, AgentConfig>;
    frontierEscalation: boolean;
    maxSubagentConcurrency: number;
    maxAutoReviewIterations: number;
    implementerFanout: FanoutMode;
    reviewFanout: FanoutMode;
};

/**
 * Fan-out policy for implementation or review.
 *
 * For implementation, `auto` keeps small or tightly related work on one
 * dispatch and `always` prefers safe parallel lanes. For review, `auto` lets
 * the Orchestrator choose direct, focused, full, or expanded review, while
 * `always` requires all three conceptual lenses but leaves additional lanes to
 * judgement. `never` forces the serial implementer or direct final review.
 */
export type FanoutMode = "auto" | "always" | "never";

/** Fan-out modes accepted in a persisted configuration. */
export const FANOUT_MODES: readonly FanoutMode[] = ["auto", "always", "never"];

/** Default value used when `implementerFanout` is omitted from a config. */
export const DEFAULT_IMPLEMENTER_FANOUT: FanoutMode = "auto";
/** Default value used when `reviewFanout` is omitted from a config. */
export const DEFAULT_REVIEW_FANOUT: FanoutMode = "auto";

/** Default value used when `maxSubagentConcurrency` is omitted from a config. */
export const DEFAULT_SUBAGENT_CONCURRENCY = 1;
/** Default value used when `maxAutoReviewIterations` is omitted from a config. */
export const DEFAULT_AUTO_REVIEW_ITERATIONS = 3;

/**
 * Legacy role identifiers persisted by older SpecOps releases, mapped to the
 * canonical role that replaced them.
 *
 * Loading a configuration that carries a legacy key migrates it to the
 * canonical identifier in memory, so existing installs keep their configured
 * model and variant without manual edits. The legacy key itself is never
 * written back: saves emit canonical identifiers only.
 */
export const LEGACY_AGENT_IDS: Readonly<Record<string, AgentId>> = {
    "specops-coordinator": AGENT_IDS.orchestrator,
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
    maxSubagentConcurrency: DEFAULT_SUBAGENT_CONCURRENCY,
    maxAutoReviewIterations: DEFAULT_AUTO_REVIEW_ITERATIONS,
    implementerFanout: DEFAULT_IMPLEMENTER_FANOUT,
    reviewFanout: DEFAULT_REVIEW_FANOUT,
};

/** Minimum persisted value for the global concurrent subagent limit. */
export const MIN_SUBAGENT_CONCURRENCY = 1;
/** Largest concurrent subagent value offered by the TUI. */
export const MAX_SUBAGENT_CONCURRENCY_SELECTABLE = 8;

/** Minimum persisted Auto review correction budget. */
export const MIN_AUTO_REVIEW_ITERATIONS = 1;
/** Largest Auto review budget value offered by the TUI. */
export const MAX_AUTO_REVIEW_ITERATIONS_SELECTABLE = 3;

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
 * Legacy role identifiers are accepted and migrated to their canonical
 * replacements, so existing installs keep their configured model and variant.
 *
 * @param value Unknown parsed configuration value.
 * @returns A cloned, validated configuration with every role entry present.
 * @throws Error when the value is malformed or contains unsupported settings.
 */
export function validateConfig(value: unknown): SpecOpsConfig {
    if (
        !isRecord(value) ||
        !hasOnlyKeys(value, [
            "agents",
            "frontierEscalation",
            "maxSubagentConcurrency",
            "maxAutoReviewIterations",
            "implementerFanout",
            "reviewFanout",
        ]) ||
        !isRecord(value.agents)
    ) {
        throw new Error("invalid SpecOps configuration");
    }
    if ("frontierEscalation" in value && typeof value.frontierEscalation !== "boolean") {
        throw new Error("invalid SpecOps configuration frontierEscalation");
    }
    const maxSubagentConcurrency = value.maxSubagentConcurrency as number;
    if (
        "maxSubagentConcurrency" in value &&
        (!Number.isInteger(maxSubagentConcurrency) ||
            maxSubagentConcurrency < MIN_SUBAGENT_CONCURRENCY)
    ) {
        throw new Error("maxSubagentConcurrency must be a positive integer");
    }
    const maxAutoReviewIterations = value.maxAutoReviewIterations as number;
    if (
        "maxAutoReviewIterations" in value &&
        (!Number.isInteger(maxAutoReviewIterations) ||
            maxAutoReviewIterations < MIN_AUTO_REVIEW_ITERATIONS)
    ) {
        throw new Error("maxAutoReviewIterations must be a positive integer");
    }
    for (const field of ["implementerFanout", "reviewFanout"] as const) {
        if (field in value && !isFanoutMode(value[field])) {
            throw new Error(`${field} must be one of: auto, always, never`);
        }
    }

    // Unknown role ids stay a hard error because they almost certainly name a
    // role this installation does not have; absent ids belong to older files.
    // Legacy identifiers are accepted here and migrated below instead.
    const entries = value.agents as Record<string, unknown>;
    const known = new Set<string>([...ALL_AGENT_IDS, ...Object.keys(LEGACY_AGENT_IDS)]);
    for (const id of Object.keys(entries)) {
        if (!known.has(id)) {
            throw new Error(
                "configuration agent catalogue does not match this SpecOps installation",
            );
        }
    }
    const migratedEntries = migrateLegacyAgentEntries(entries);

    for (const id of ALL_AGENT_IDS) {
        const entry = migratedEntries[id];
        if (entry === undefined) continue;
        assertAgentEntryShape(id, entry);
    }

    const config = {
        agents: Object.fromEntries(
            ALL_AGENT_IDS.map(id => [id, (migratedEntries[id] ?? {}) as AgentConfig]),
        ),
        frontierEscalation: value.frontierEscalation ?? false,
        maxSubagentConcurrency: value.maxSubagentConcurrency ?? DEFAULT_SUBAGENT_CONCURRENCY,
        maxAutoReviewIterations: value.maxAutoReviewIterations ?? DEFAULT_AUTO_REVIEW_ITERATIONS,
        implementerFanout: value.implementerFanout ?? DEFAULT_IMPLEMENTER_FANOUT,
        reviewFanout: value.reviewFanout ?? DEFAULT_REVIEW_FANOUT,
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
 * Resolve legacy role identifiers to their canonical replacements.
 *
 * A legacy entry with no canonical counterpart is migrated as-is, preserving
 * its configured model and variant. Malformed legacy entries are rejected
 * before migration. When both spellings are present, equal entries collapse
 * to the canonical one, while conflicting entries fail loudly instead of
 * silently preferring one of the two user choices.
 *
 * @param entries Raw role entries keyed by role identifier.
 * @returns A fresh record keyed by canonical identifiers only.
 * @throws Error when a legacy entry is malformed or disagrees with its
 *     canonical entry.
 */
function migrateLegacyAgentEntries(entries: Record<string, unknown>): Record<string, unknown> {
    const migrated: Record<string, unknown> = { ...entries };
    for (const [legacyId, canonicalId] of Object.entries(LEGACY_AGENT_IDS)) {
        const legacy = migrated[legacyId];
        if (legacy === undefined) continue;
        delete migrated[legacyId];
        // Shape-check the legacy entry before migrating it so a malformed
        // entry fails loudly instead of being silently collapsed into a
        // canonical counterpart that happens to carry the same model/variant.
        assertAgentEntryShape(canonicalId, legacy);
        const canonical = migrated[canonicalId];
        if (canonical === undefined) {
            migrated[canonicalId] = legacy;
        } else if (!agentEntryEquals(legacy, canonical)) {
            throw new Error(
                `conflicting SpecOps configuration for ${canonicalId}: the legacy ` +
                    `"${legacyId}" entry and the "${canonicalId}" entry set different ` +
                    `models or variants. Remove the legacy "${legacyId}" entry or make ` +
                    "both entries identical, then restart OpenCode.",
            );
        }
    }
    return migrated;
}

/**
 * Reject an entry whose shape does not match the persisted role entry shape.
 *
 * @param id Role identifier named in the thrown error.
 * @param entry Raw entry value from a parsed configuration.
 * @throws Error when the entry is not a record holding only an optional string
 *     `model` and an optional non-blank string `variant`.
 */
function assertAgentEntryShape(id: string, entry: unknown): void {
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

/**
 * Compare two role entries by their meaningful model/variant fields.
 *
 * @param left Raw entry from a persisted configuration.
 * @param right Raw entry from a persisted configuration.
 * @returns Whether both entries carry the same model and variant choices.
 */
function agentEntryEquals(left: unknown, right: unknown): boolean {
    const a = (isRecord(left) ? left : {}) as { model?: unknown; variant?: unknown };
    const b = (isRecord(right) ? right : {}) as { model?: unknown; variant?: unknown };
    return a.model === b.model && a.variant === b.variant;
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

/**
 * Check that a fan-out field carries one of the accepted mode strings.
 *
 * @param value Unknown field value from a parsed configuration.
 * @returns Whether the value is a valid {@link FanoutMode}.
 */
function isFanoutMode(value: unknown): value is FanoutMode {
    return typeof value === "string" && (FANOUT_MODES as readonly string[]).includes(value);
}
