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
        id: "specops_archive_instructions",
        description: "Read normalized OpenSpec archive instructions for a named change.",
        args: ["change"],
    },
    {
        id: "specops_apply_instructions",
        description: "Read normalized OpenSpec apply instructions for a named change.",
        args: ["change"],
    },
    {
        id: "specops_config",
        description:
            "Read the effective SpecOps configuration snapshot for the current OpenCode process.",
        args: [],
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
        id: "specops_progress",
        description:
            "Report in-flight parallel progress for a named change: review critic fan-out " +
            "status and implementer dispatch progress against durable task checkboxes.",
        args: ["change", "implementerAssignments", "reviewFanout"],
    },
    {
        id: "specops_review_guard",
        description:
            "Capture or verify the review worktree-mutation guard for a named change: snapshot " +
            "protected state before review fan-out and verify no protected state changed after fan-in.",
        args: ["change", "operation"],
    },
    {
        id: "specops_status",
        description:
            "Read normalized OpenSpec workflow status for a named change, including the current " +
            "workflow phase, whether implementation and review are legally available, and the " +
            "actions that are legal right now.",
        args: ["change"],
    },
    {
        id: "specops_validate_change",
        description:
            "Validate one active OpenSpec change with strict, change-scoped validation. " +
            "Returns action=continue_planning for an expected empty first-pass change and " +
            "action=block for actual validation failures.",
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
