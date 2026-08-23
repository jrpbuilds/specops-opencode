import { ALL_AGENT_IDS } from "../agents/ids.js";
import type { SpecOpsConfig } from "../config.js";
import type { OpenSpecDoctorResult } from "../openspec/doctor.js";
import { errorMessage } from "../openspec/helpers.js";
import { formatRemediation } from "../openspec/remediation.js";

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
    loadConfig: () => Promise<SpecOpsConfig>;
};

/**
 * Collect SpecOps, OpenSpec, and role-configuration diagnostics.
 *
 * OpenSpec failures and invalid configuration are reported as text rather than
 * stopping the report early, allowing the user to see the most useful repair
 * information in one result.
 *
 * @param deps Version readers, OpenSpec diagnostics, and config loader.
 * @returns A concise multi-line report suitable for a tool result.
 */
export async function doctor(deps: DoctorDeps): Promise<string> {
    const specopsVersion = await readVersion(deps.specopsVersion);
    const openspecVersion = await readOpenSpecVersion(deps.openspecVersion);
    const lines = [
        "SpecOps Doctor",
        "",
        `SpecOps: ${specopsVersion}`,
        `OpenSpec: ${openspecVersion ?? "unavailable"}`,
        "",
    ];

    let openspecHealthy = false;
    let openspecInitialized = false;
    let openspecUnavailable = openspecVersion === null;
    let openspecIncompatible = false;

    if (openspecUnavailable) {
        lines.push("✗ OpenSpec CLI not found");
        lines.push(
            ...formatRemediation("OPENSPEC_UNAVAILABLE", { wrapper: "OpenSpec" }).split("\n"),
        );
    } else {
        lines.push("✓ OpenSpec CLI available");
        const result = await deps.openspecDoctor();
        if (result.incompatible) {
            openspecIncompatible = true;
            lines.push("✗ incompatible install");
            for (const capability of result.incompatible.missingCapabilities) {
                lines.push(`  missing: ${capability.id} — ${capability.description}`);
            }
            lines.push(
                `  installed: ${result.incompatible.installedVersion ?? "unknown"} (SpecOps targets ${result.incompatible.targetVersion})`,
            );
            lines.push(...result.incompatible.remediation.split("\n"));
        } else if (result.error) {
            lines.push(`✗ OpenSpec doctor failed: ${result.error}`);
            if (result.remediation) lines.push(...result.remediation.split("\n"));
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
    } else if (openspecIncompatible) {
        // The incompatible state already includes its concrete Fix block.
    } else if (!openspecInitialized) {
        lines.push("", "Run /specops-onboard to initialize this project.");
    } else if (openspecHealthy) {
        lines.push("", "SpecOps is ready.");
    }

    return lines.join("\n");
}

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
 * Read the optional OpenSpec version while preserving unavailable as `null`.
 *
 * The caller uses `null` to distinguish an absent CLI from a present CLI whose
 * version string happens to be unavailable.
 */
async function readOpenSpecVersion(read: () => Promise<string | null>): Promise<string | null> {
    try {
        const version = await read();
        return version?.trim() || null;
    } catch {
        return null;
    }
}
