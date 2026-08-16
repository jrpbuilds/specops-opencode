import { describe, expect, test } from "bun:test";
import { requireLifecyclePermission } from "../../src/tools/lifecycle-permission.js";

describe("requireLifecyclePermission", () => {
    test("asks for the lifecycle permission scoped to the current tool", async () => {
        let request: Record<string, unknown> | undefined;

        await requireLifecyclePermission(
            {
                ask: async input => {
                    request = input;
                },
            },
            "specops_doctor",
        );

        expect(request).toEqual({
            permission: "specops_lifecycle",
            patterns: ["specops_doctor"],
            always: ["specops_doctor"],
            metadata: { tool: "specops_doctor" },
        });
    });
});
