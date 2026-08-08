import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool";
import { ALL_AGENT_IDS } from "../agents/ids.js";
import { loadConfig, type SpecOpsConfig } from "../config.js";
import {
    getOpenSpecVersion,
    runOpenSpecDoctor,
    type OpenSpecDoctorResult,
} from "../openspec/index.js";
import { getSpecOpsVersion } from "../version.js";

/** Injected operations for deterministic doctor branching tests. */
export type DoctorDeps = {
    specopsVersion: () => Promise<string>;
    openspecVersion: () => Promise<string | null>;
    openspecDoctor: () => Promise<OpenSpecDoctorResult>;
    loadConfig: () => Promise<SpecOpsConfig>;
};

/** Run SpecOps diagnostics and return a concise human-readable report. */
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

export const doctorTool: ToolDefinition = tool({
    description:
        "Run SpecOps diagnostics: report versions, OpenSpec health, configuration validity, and model-role mappings.",
    args: {},
    async execute(_args, context) {
        context.metadata({ title: "Running SpecOps doctor…" });
        return doctor({
            specopsVersion: getSpecOpsVersion,
            openspecVersion: getOpenSpecVersion,
            openspecDoctor: () => runOpenSpecDoctor(context.directory),
            loadConfig: () => loadConfig(),
        });
    },
});

/** Read and trim a required version, using `unknown` for failures or blanks. */
async function readVersion(read: () => Promise<string>): Promise<string> {
    try {
        const version = (await read()).trim();
        return version || "unknown";
    } catch {
        return "unknown";
    }
}

/** Read and trim an optional OpenSpec version, preserving unavailable as `null`. */
async function readOpenSpecVersion(read: () => Promise<string | null>): Promise<string | null> {
    try {
        const version = await read();
        return version?.trim() || null;
    } catch {
        return null;
    }
}

/** Convert an unknown caught value into a message suitable for the report. */
function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
