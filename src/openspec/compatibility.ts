import { getOpenSpecVersion } from "./cli.js";
import { runCaptureStdout } from "../helpers.js";
import type { CaptureStdout } from "./helpers.js";

/** A read-only `--help` probe: arguments to run and tokens expected in output. */
export type ProbeSpec = {
    helpArgs: string[];
    tokens: string[];
};

/** One OpenSpec capability SpecOps relies on, optionally verified by a probe. */
export type Capability = {
    id: string;
    description: string;
    probe?: ProbeSpec;
    /** Defaults to blocking (`undefined` === true). A non-blocking miss lands in
     *  `unsupportedCapabilities` and never flips `compatible`. */
    blocking?: boolean;
};

/** Outcome of probing the installed OpenSpec CLI against the target surface. */
export type CompatibilityReport = {
    compatible: boolean;
    missingCapabilities: Capability[];
    unsupportedCapabilities: Capability[];
    installedVersion: string | null;
    targetVersion: string;
    warnings: string[];
};

/**
 * 1.10.0 is the OpenSpec version SpecOps is developed and tested against. It
 * is a target, not a floor: installs older or newer than the target are
 * compatible when every capability probe succeeds.
 */
export const TARGET_OPENSPEC_VERSION = "1.10.0";

/**
 * Probes intentionally run only `<command> --help`; they never execute target
 * commands, so mutating surfaces such as `new` and `archive` cannot touch a
 * workspace.
 */
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
        id: "validate-archived",
        description: "openspec validate --archived JSON output",
        probe: { helpArgs: ["validate", "--help"], tokens: ["--archived", "--json"] },
        blocking: false,
    },
    {
        id: "instructions-resolved-output-path",
        description: "instructions responses include a usable resolved output path",
    },
];

/** Compare normalized major/minor/patch versions without adding a dependency. */
export function compareVersions(installed: string, target: string): -1 | 0 | 1 {
    const normalize = (version: string): number[] => {
        const numbers = version.trim().replace(/^v/i, "").split(/[+-]/, 1)[0].split(".");
        return [0, 1, 2].map(index => {
            const value = Number(numbers[index] ?? 0);
            return Number.isFinite(value) ? value : 0;
        });
    };
    const actual = normalize(installed);
    const expected = normalize(target);
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
    const unsupportedCapabilities: Capability[] = [];
    const warnings: string[] = [];

    const recordMiss = (capability: Capability) =>
        (capability.blocking === false ? unsupportedCapabilities : missingCapabilities).push(
            capability,
        );

    for (const capability of OPENSPEC_CAPABILITIES) {
        if (!capability.probe) {
            if (
                installedVersion === null ||
                compareVersions(installedVersion, TARGET_OPENSPEC_VERSION) < 0
            ) {
                warnings.push(
                    `OpenSpec ${installedVersion ?? "unknown"} is below SpecOps target ${TARGET_OPENSPEC_VERSION} — capability ${capability.id} not directly verifiable`,
                );
            }
            continue;
        }

        let result: { stdout: string; exitCode: number | null };
        try {
            result = await capture("openspec", capability.probe.helpArgs, cwd);
        } catch {
            recordMiss(capability);
            continue;
        }

        if (
            result.exitCode !== 0 ||
            result.exitCode === null ||
            !capability.probe.tokens.every(token => result.stdout.includes(token))
        ) {
            recordMiss(capability);
        }
    }

    return {
        compatible: missingCapabilities.length === 0,
        missingCapabilities,
        unsupportedCapabilities,
        installedVersion,
        targetVersion: TARGET_OPENSPEC_VERSION,
        warnings,
    };
}
