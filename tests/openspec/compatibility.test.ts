import { describe, expect, test } from "bun:test";
import {
    compareVersions,
    OPENSPEC_CAPABILITIES,
    probeCompatibility,
    TARGET_OPENSPEC_VERSION,
} from "../../src/openspec/compatibility.js";
import type { CaptureStdout } from "../../src/openspec/helpers.js";

function completeHelp(captureMissing?: string): CaptureStdout {
    return async (_command, args) => {
        const capability = OPENSPEC_CAPABILITIES.find(item =>
            item.probe?.helpArgs.every((arg, index) => args[index] === arg),
        );
        const tokens = capability?.probe?.tokens ?? [];
        return {
            exitCode: captureMissing === capability?.id ? 1 : 0,
            stdout: captureMissing === capability?.id ? "" : tokens.join(" "),
        };
    };
}

describe("OpenSpec compatibility policy", () => {
    test("passes when every capability is observable", async () => {
        const result = await probeCompatibility(
            "/project",
            completeHelp(),
            async () => TARGET_OPENSPEC_VERSION,
        );
        expect(result.compatible).toBe(true);
        expect(result.missingCapabilities).toEqual([]);
        expect(result.warnings).toEqual([]);
    });

    test("names each individually missing help capability", async () => {
        for (const capability of OPENSPEC_CAPABILITIES.filter(item => item.probe)) {
            const result = await probeCompatibility(
                "/project",
                completeHelp(capability.id),
                async () => TARGET_OPENSPEC_VERSION,
            );
            expect(result.compatible).toBe(false);
            expect(result.missingCapabilities.map(item => item.id)).toContain(capability.id);
        }
    });

    test("reports a non-zero help command as missing", async () => {
        const result = await probeCompatibility(
            "/project",
            async (_command, args) => ({
                stdout: args[0] === "list" ? "--json" : "",
                exitCode: args[0] === "list" ? 1 : 0,
            }),
            async () => TARGET_OPENSPEC_VERSION,
        );
        expect(result.missingCapabilities.map(item => item.id)).toContain("list-json");
    });

    test("probes the nested new change help surface for JSON support", async () => {
        const calls: string[][] = [];
        const result = await probeCompatibility(
            "/project",
            async (_command, args) => {
                calls.push(args);
                const capability = OPENSPEC_CAPABILITIES.find(item =>
                    item.probe?.helpArgs.every((arg, index) => args[index] === arg),
                );
                return {
                    stdout:
                        capability?.id === "new-change-json"
                            ? "--json"
                            : (capability?.probe?.tokens.join(" ") ?? ""),
                    exitCode: 0,
                };
            },
            async () => TARGET_OPENSPEC_VERSION,
        );

        expect(result.compatible).toBe(true);
        expect(calls).toContainEqual(["new", "change", "--help"]);
    });

    test("marks nested new change help missing when JSON is absent", async () => {
        const result = await probeCompatibility(
            "/project",
            async (_command, args) => {
                const capability = OPENSPEC_CAPABILITIES.find(item =>
                    item.probe?.helpArgs.every((arg, index) => args[index] === arg),
                );
                return {
                    stdout:
                        capability?.id === "new-change-json"
                            ? "Usage: openspec new change"
                            : (capability?.probe?.tokens.join(" ") ?? ""),
                    exitCode: 0,
                };
            },
            async () => TARGET_OPENSPEC_VERSION,
        );

        expect(result.missingCapabilities.map(item => item.id)).toContain("new-change-json");
    });

    test("uses the version fallback for an unprobeable capability", async () => {
        const pass = await probeCompatibility(
            "/project",
            completeHelp(),
            async () => "v1.10.0-beta.1+build",
        );
        expect(pass.missingCapabilities).toEqual([]);
        expect(pass.warnings).toEqual([]);

        const fail = await probeCompatibility("/project", completeHelp(), async () => "1.7.9");
        expect(fail.missingCapabilities).toEqual([]);
        expect(fail.warnings).toHaveLength(1);
        expect(fail.warnings[0]).toContain("instructions-resolved-output-path");
        expect(fail.warnings[0]).toContain(TARGET_OPENSPEC_VERSION);
        expect(fail.warnings[0]).toContain("1.7.9");
    });

    test("accepts a newer-than-target version when every probe succeeds", async () => {
        const result = await probeCompatibility("/project", completeHelp(), async () => "2.0.0");

        expect(result.compatible).toBe(true);
        expect(result.missingCapabilities).toEqual([]);
        expect(result.warnings).toEqual([]);
    });

    test("accepts an older-than-target version when every probe succeeds", async () => {
        const result = await probeCompatibility("/project", completeHelp(), async () => "1.7.9");

        expect(result.compatible).toBe(true);
        expect(result.missingCapabilities).toEqual([]);
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0]).toContain("instructions-resolved-output-path");
    });

    test("warns but stays compatible when the version is unavailable", async () => {
        const result = await probeCompatibility("/project", completeHelp(), async () => null);

        expect(result.compatible).toBe(true);
        expect(result.missingCapabilities).toEqual([]);
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0]).toContain("OpenSpec unknown");
    });

    test("does not execute a capability probe without --help", () => {
        for (const capability of OPENSPEC_CAPABILITIES) {
            if (capability.probe) expect(capability.probe.helpArgs.at(-1)).toBe("--help");
        }
    });

    test("compares versions after normalizing prefixes and suffixes", () => {
        expect(compareVersions("v1.10.0-beta.1+build", "1.10.0")).toBe(0);
        expect(compareVersions("1.10.0", "1.10.0")).toBe(0);
        expect(compareVersions("1.9.0", "1.10.0")).toBe(-1);
        expect(compareVersions("1.11.0", "1.10.0")).toBe(1);
    });

    test("is deterministic for an unchanged stubbed install", async () => {
        const capture = completeHelp("doctor-json");
        const first = await probeCompatibility("/project", capture, async () => "1.10.0");
        const second = await probeCompatibility("/project", capture, async () => "1.10.0");
        expect(second).toEqual(first);
    });
});
