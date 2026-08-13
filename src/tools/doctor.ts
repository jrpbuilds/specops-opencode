import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool";
import { ALL_AGENT_IDS } from "../agents/ids.js";
import { loadConfig, type SpecOpsConfig } from "../config.js";
import { isEngramAvailable } from "../engram.js";
import { getOpenSpecVersion } from "../openspec/cli.js";
import { runOpenSpecDoctor, type OpenSpecDoctorResult } from "../openspec/doctor.js";
import { getSpecOpsVersion } from "../version.js";

/**
 * External operations used by the diagnostics report.
 *
 * Each dependency is injected so the report can cover unavailable, unhealthy,
 * and malformed environments without coupling unit tests to the host machine.
 */
export type DoctorDeps = {
    specopsVersion: () => Promise<string>;
    openspecVersion: () => Promise<string | null>;
    openspecDoctor: () => Promise<OpenSpecDoctorResult>;
    engramVersion: () => Promise<string | null>;
    loadConfig: () => Promise<SpecOpsConfig>;
};

/**
 * Collect SpecOps, OpenSpec, and role-configuration diagnostics, plus a
 * non-blocking informational Engram version line when the optional binary is
 * installed.
 *
 * OpenSpec failures and invalid configuration are reported as text rather than
 * stopping the report early, allowing the user to see the most useful repair
 * information in one result. Engram availability never affects any verdict or
 * repair guidance in the report.
 *
 * @param deps Version readers, OpenSpec diagnostics, and config loader.
 * @returns A concise multi-line report suitable for a tool result.
 */
export async function doctor(deps: DoctorDeps): Promise<string> {
    const specopsVersion = await readVersion(deps.specopsVersion);
    const openspecVersion = await readOptionalVersion(deps.openspecVersion);
    const engramVersion = await readOptionalVersion(deps.engramVersion);
    const lines = [
        "SpecOps Doctor",
        "",
        `SpecOps: ${specopsVersion}`,
        `OpenSpec: ${openspecVersion ?? "unavailable"}`,
        `Engram: ${engramVersion ?? "unavailable"} (optional)`,
        "",
    ];

    let openspecHealthy = false;
    let openspecInitialized = false;
    let openspecUnavailable = openspecVersion === null;

    if (openspecUnavailable) {
        lines.push("✗ OpenSpec CLI not found");
    } else {
        lines.push("✓ OpenSpec CLI available");
        const result = await deps.openspecDoctor();
        if (result.error) {
            lines.push(`✗ OpenSpec doctor failed: ${result.error}`);
        } else if (!result.initialized) {
            lines.push("✗ OpenSpec project not initialized");
        } else {
            openspecInitialized = true;
            openspecHealthy = result.healthy;
            lines.push("✓ OpenSpec project initialized");
            if (result.healthy) {
                lines.push("✓ OpenSpec doctor healthy");
            } else {
                lines.push("✗ OpenSpec doctor reported issues:");
                for (const issue of result.issues) {
                    lines.push(`  - ${issue.replaceAll("\n", "\n    ")}`);
                }
            }
        }
    }

    let config: SpecOpsConfig | undefined;
    let configError: string | undefined;
    try {
        config = await deps.loadConfig();
        lines.push("✓ SpecOps configuration valid");
    } catch (error) {
        configError = errorMessage(error);
        lines.push(`✗ SpecOps configuration invalid: ${configError}`);
    }

    if (config) {
        const explicit = ALL_AGENT_IDS.filter(id =>
            Boolean(config?.agents[id].model?.trim()),
        ).length;
        lines.push(`✓ ${ALL_AGENT_IDS.length} model roles configured`);
        lines.push(`  - ${explicit} explicit models`);
        lines.push(`  - ${ALL_AGENT_IDS.length - explicit} OpenCode default`);
    }

    if (configError) {
        lines.push("", "Open SpecOps Configure to fix the configuration.");
    } else if (openspecUnavailable) {
        lines.push("", "Install OpenSpec: npm install -g @fission-ai/openspec");
    } else if (!openspecInitialized) {
        lines.push("", "Run /specops-onboard to initialize this project.");
    } else if (openspecHealthy) {
        lines.push("", "SpecOps is ready.");
    }

    return lines.join("\n");
}

/**
 * Expose the diagnostics report through the SpecOps tool surface.
 *
 * The tool supplies the current configuration and project directory through
 * injected operations while leaving report formatting in `doctor`.
 */
export const doctorTool: ToolDefinition = tool({
    description:
        "Run SpecOps diagnostics: report versions (including optional Engram availability), OpenSpec health, configuration validity, and model-role mappings.",
    args: {},
    async execute(_args, context) {
        context.metadata({ title: "Running SpecOps doctor…" });
        return doctor({
            specopsVersion: getSpecOpsVersion,
            openspecVersion: getOpenSpecVersion,
            openspecDoctor: () => runOpenSpecDoctor(context.directory),
            engramVersion: isEngramAvailable,
            loadConfig: () => loadConfig(),
        });
    },
});

/**
 * Read a required version defensively, normalizing blank or failed reads to
 * `unknown` so one unavailable version cannot suppress the rest of the report.
 */
async function readVersion(read: () => Promise<string>): Promise<string> {
    try {
        const version = (await read()).trim();
        return version || "unknown";
    } catch {
        return "unknown";
    }
}

/**
 * Read an optional CLI version while preserving unavailable as `null`.
 *
 * The caller uses `null` to distinguish an absent CLI from a present CLI whose
 * version string happens to be unavailable. Used for both OpenSpec and the
 * optional Engram binary.
 */
async function readOptionalVersion(read: () => Promise<string | null>): Promise<string | null> {
    try {
        const version = await read();
        return version?.trim() || null;
    } catch {
        return null;
    }
}

/**
 * Convert any caught value into a stable human-readable report message.
 *
 * Error instances use their message; primitive or unknown values fall back to
 * normal string conversion for diagnostics that never throw while reporting.
 */
function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
