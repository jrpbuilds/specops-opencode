import { describe, expect, test } from "bun:test";
import { SPECOPS_AUTO_REPLICATE_PERMISSION } from "../../src/agents/permissions.js";

describe("SPECOPS_AUTO_REPLICATE_PERMISSION", () => {
    test("covers exactly the OpenCode permission keys that default to ask", () => {
        expect(SPECOPS_AUTO_REPLICATE_PERMISSION).toEqual({
            external_directory: "allow",
            doom_loop: "allow",
        });
    });

    test("uses allow for every key, replicating --auto approval behaviour", () => {
        expect(
            Object.values(SPECOPS_AUTO_REPLICATE_PERMISSION).every(value => value === "allow"),
        ).toBe(true);
    });
});
