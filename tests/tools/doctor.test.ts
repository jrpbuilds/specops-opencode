import { describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG } from "../../src/config.js";
import { doctor, type DoctorDeps } from "../../src/tools/doctor.js";

function deps(overrides: Partial<DoctorDeps> = {}): DoctorDeps {
    return {
        specopsVersion: async () => "0.1.0",
        openspecVersion: async () => "1.8.0",
        openspecDoctor: async () => ({ initialized: true, healthy: true, issues: [] }),
        loadConfig: async () => structuredClone(DEFAULT_CONFIG),
        ...overrides,
    };
}

function configWithExplicitModels(count: number) {
    const config = structuredClone(DEFAULT_CONFIG);
    const ids = Object.keys(config.agents);
    for (const id of ids.slice(0, count))
        config.agents[id as keyof typeof config.agents] = { model: "provider/model" };
    return config;
}

describe("doctor", () => {
    test("reports OpenSpec unavailable but still reports valid SpecOps configuration", async () => {
        let doctorCalled = false;
        const result = await doctor(
            deps({
                openspecVersion: async () => null,
                openspecDoctor: async () => {
                    doctorCalled = true;
                    return { initialized: true, healthy: true, issues: [] };
                },
                loadConfig: async () => configWithExplicitModels(2),
            }),
        );

        expect(result).toContain("OpenSpec: unavailable");
        expect(result).toContain("✗ OpenSpec CLI not found");
        expect(result).toContain("✓ SpecOps configuration valid");
        expect(result).toContain("- 2 explicit models");
        expect(result).toContain("- 5 OpenCode default");
        expect(doctorCalled).toBe(false);
    });

    test("reports an uninitialized project and still includes the role summary", async () => {
        const result = await doctor(
            deps({
                openspecDoctor: async () => ({ initialized: false, healthy: false, issues: [] }),
                loadConfig: async () => configWithExplicitModels(3),
            }),
        );

        expect(result).toContain("✗ OpenSpec project not initialized");
        expect(result).not.toContain("OpenSpec doctor healthy");
        expect(result).toContain("✓ 7 model roles configured");
        expect(result).toContain("- 3 explicit models");
        expect(result).toContain("- 4 OpenCode default");
        expect(result).toContain("Run /specops-onboard");
    });

    test("reports a healthy installation", async () => {
        const result = await doctor(deps({ loadConfig: async () => configWithExplicitModels(5) }));

        expect(result).toContain("SpecOps: 0.1.0");
        expect(result).toContain("OpenSpec: 1.8.0");
        expect(result).toContain("✓ OpenSpec project initialized");
        expect(result).toContain("✓ OpenSpec doctor healthy");
        expect(result).toContain("✓ 7 model roles configured");
        expect(result).toContain("- 5 explicit models");
        expect(result).toContain("- 2 OpenCode default");
        expect(result).toContain("SpecOps is ready.");
    });

    test("reports OpenSpec health issues", async () => {
        const result = await doctor(
            deps({
                openspecDoctor: async () => ({
                    initialized: true,
                    healthy: false,
                    issues: ["schema: invalid config\nfix: update openspec/config.yaml"],
                }),
            }),
        );

        expect(result).toContain("✓ OpenSpec project initialized");
        expect(result).toContain("✗ OpenSpec doctor reported issues:");
        expect(result).toContain("schema: invalid config");
        expect(result).toContain("fix: update openspec/config.yaml");
        expect(result).not.toContain("SpecOps is ready.");
    });

    test("reports invalid SpecOps configuration and its Configure CTA", async () => {
        const result = await doctor(
            deps({
                loadConfig: async () => {
                    throw new Error("invalid SpecOps configuration entry: specops-explorer");
                },
            }),
        );

        expect(result).toContain("✗ SpecOps configuration invalid");
        expect(result).toContain("specops-explorer");
        expect(result).toContain("Open SpecOps Configure");
        expect(result).not.toContain("model roles configured");
    });

    test("reports an OpenSpec doctor error without terminating the report", async () => {
        const result = await doctor(
            deps({
                openspecDoctor: async () => ({
                    initialized: false,
                    healthy: false,
                    issues: [],
                    error: "openspec doctor crashed",
                }),
            }),
        );

        expect(result).toContain("✗ OpenSpec doctor failed: openspec doctor crashed");
        expect(result).toContain("Run /specops-onboard");
        expect(result).toContain("✓ SpecOps configuration valid");
    });

    test("normalizes a failed SpecOps version reader to unknown", async () => {
        const result = await doctor(
            deps({
                specopsVersion: async () => {
                    throw new Error("cannot read version");
                },
            }),
        );

        expect(result).toContain("SpecOps: unknown");
        expect(result).toContain("OpenSpec: 1.8.0");
    });

    test("normalizes a failed OpenSpec version reader to unavailable", async () => {
        const result = await doctor(
            deps({
                openspecVersion: async () => {
                    throw new Error("openspec not found");
                },
            }),
        );

        expect(result).toContain("OpenSpec: unavailable");
        expect(result).toContain("✗ OpenSpec CLI not found");
    });
});
