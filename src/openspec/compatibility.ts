import { getOpenSpecVersion } from "./cli.js";
import { runCaptureStdout } from "../helpers.js";
import type { CaptureStdout } from "./helpers.js";

export type ProbeSpec = {
    helpArgs: string[];
    tokens: string[];
};

export type Capability = {
    id: string;
    description: string;
    probe?: ProbeSpec;
};

export type CompatibilityReport = {
    compatible: boolean;
    missingCapabilities: Capability[];
    installedVersion: string | null;
    minimumVersion: string;
};

// 1.8.0 is the oldest OpenSpec version this plugin is developed and tested against.
export const MINIMUM_OPENSPEC_VERSION = "1.8.0";

// Probes intentionally run only `<command> --help`; they never execute target
// commands, so mutating surfaces such as `new` and `archive` cannot touch a workspace.
export const OPENSPEC_CAPABILITIES: readonly Capability[] = [
    {
        id: "list-json",
        description: "openspec list JSON output",
        probe: { helpArgs: ["list", "--help"], tokens: ["--json"] },
    },
    {
        id: "status-change-json",
        description: "change-scoped openspec status JSON output",
        probe: { helpArgs: ["status", "--help"], tokens: ["--change", "--json"] },
    },
    {
        id: "instructions-change-json",
        description: "change-scoped artifact instructions JSON output",
        probe: { helpArgs: ["instructions", "--help"], tokens: ["--change", "--json"] },
    },
    {
        id: "new-change-json",
        description: "OpenSpec change creation JSON output",
        probe: { helpArgs: ["new", "change", "--help"], tokens: ["--json"] },
    },
    {
        id: "archive-yes-json",
        description: "non-interactive OpenSpec archive JSON output",
        probe: { helpArgs: ["archive", "--help"], tokens: ["--yes", "--json"] },
    },
    {
        id: "doctor-json",
        description: "OpenSpec doctor JSON output",
        probe: { helpArgs: ["doctor", "--help"], tokens: ["--json"] },
    },
    {
        id: "validate-strict-scoped",
        description: "openspec validate with --strict and scoped item validation",
        probe: {
            helpArgs: ["validate", "--help"],
            tokens: ["[item-name]", "--strict", "--json"],
        },
    },
    {
        id: "instructions-resolved-output-path",
        description: "instructions responses include a usable resolved output path",
    },
];

/** Compare normalized major/minor/patch versions without adding a dependency. */
export function compareVersions(installed: string, minimum: string): -1 | 0 | 1 {
    const normalize = (version: string): number[] => {
        const numbers = version.trim().replace(/^v/i, "").split(/[+-]/, 1)[0].split(".");
        return [0, 1, 2].map(index => {
            const value = Number(numbers[index] ?? 0);
            return Number.isFinite(value) ? value : 0;
        });
    };
    const actual = normalize(installed);
    const expected = normalize(minimum);
    for (let index = 0; index < 3; index += 1) {
        if (actual[index] < expected[index]) return -1;
        if (actual[index] > expected[index]) return 1;
    }
    return 0;
}

/** Probe the installed CLI's read-only capability surface. */
export async function probeCompatibility(
    cwd?: string,
    capture: CaptureStdout = runCaptureStdout,
    readVersion: () => Promise<string | null> = getOpenSpecVersion,
): Promise<CompatibilityReport> {
    const installedVersion = await readVersion();
    const missingCapabilities: Capability[] = [];

    for (const capability of OPENSPEC_CAPABILITIES) {
        if (!capability.probe) {
            if (
                installedVersion === null ||
                compareVersions(installedVersion, MINIMUM_OPENSPEC_VERSION) < 0
            ) {
                missingCapabilities.push(capability);
            }
            continue;
        }

        let result: { stdout: string; exitCode: number | null };
        try {
            result = await capture("openspec", capability.probe.helpArgs, cwd);
        } catch {
            missingCapabilities.push(capability);
            continue;
        }

        if (
            result.exitCode !== 0 ||
            result.exitCode === null ||
            !capability.probe.tokens.every(token => result.stdout.includes(token))
        ) {
            missingCapabilities.push(capability);
        }
    }

    return {
        compatible: missingCapabilities.length === 0,
        missingCapabilities,
        installedVersion,
        minimumVersion: MINIMUM_OPENSPEC_VERSION,
    };
}
