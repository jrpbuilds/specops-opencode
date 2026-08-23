import { describe, expect, test } from "bun:test";
import { TOOLS } from "../../src/host/tools/index.js";

/**
 * The registered catalogue is a compatibility contract: OpenCode 1 users and
 * coordinator prompts depend on these exact tool names, descriptions, and
 * argument shapes surviving refactors of either host layer.
 */
const EXPECTED_TOOLS = [
    {
        id: "specops_archive",
        description: "Archive a named OpenSpec change using the native OpenSpec archive operation.",
        args: ["change"],
    },
    {
        id: "specops_context",
        description:
            "Return deterministic current OpenSpec facts: availability, initialization, and active changes.",
        args: [],
    },
    {
        id: "specops_create_change",
        description: "Create a named OpenSpec change using the native OpenSpec creation operation.",
        args: ["change", "goal"],
    },
    {
        id: "specops_doctor",
        description:
            "Run SpecOps diagnostics: report versions, OpenSpec health, configuration validity, and model-role mappings.",
        args: [],
    },
    {
        id: "specops_onboard",
        description:
            "Onboard the current project for OpenSpec: check availability, detect an existing root, and run openspec init if needed.",
        args: [],
    },
    {
        id: "specops_status",
        description: "Read normalized OpenSpec workflow status for a named change.",
        args: ["change"],
    },
    {
        id: "specops_validate_change",
        description: "Validate one active OpenSpec change with strict, change-scoped validation.",
        args: ["change"],
    },
];

describe("V1 tool registry contract", () => {
    test("registers exactly the SpecOps lifecycle tools under stable names", () => {
        expect(Object.keys(TOOLS).sort()).toEqual(EXPECTED_TOOLS.map(tool => tool.id).sort());
    });

    test("keeps descriptions and argument keys unchanged", () => {
        for (const expected of EXPECTED_TOOLS) {
            const definition = TOOLS[expected.id] as unknown as {
                description: string;
                args: Record<string, unknown>;
            };
            expect(definition.description).toBe(expected.description);
            expect(Object.keys(definition.args).sort()).toEqual([...expected.args].sort());
        }
    });
});
