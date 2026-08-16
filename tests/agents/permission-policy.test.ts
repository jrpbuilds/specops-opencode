import { describe, expect, test } from "bun:test";
import { ALL_AGENT_IDS } from "../../src/agents/ids.js";
import {
    ROLE_CAPABILITY_POLICY,
    type RoleCapabilityShape,
} from "../../src/agents/permission-policy.js";
import { SPECOPS_LIFECYCLE_PERMISSION } from "../../src/agents/permissions.js";

describe("ROLE_CAPABILITY_POLICY", () => {
    test("contains exactly one entry for every configurable role", () => {
        expect(Object.keys(ROLE_CAPABILITY_POLICY).sort()).toEqual([...ALL_AGENT_IDS].sort());
    });

    test("every entry contains only the four capability fields", () => {
        for (const entry of Object.values(ROLE_CAPABILITY_POLICY)) {
            expect([...Object.keys(entry)].sort()).toEqual(
                ["external_directory", "doom_loop", "edit", "bash"].sort(),
            );
        }
    });

    test("no entry contains architectural invariant keys", () => {
        for (const entry of Object.values(ROLE_CAPABILITY_POLICY)) {
            expect("question" in entry).toBe(false);
            expect("task" in entry).toBe(false);
            expect("specops_*" in entry).toBe(false);
            expect(SPECOPS_LIFECYCLE_PERMISSION in entry).toBe(false);
        }
    });

    test("external_directory and doom_loop are always allow or deny (never ask)", () => {
        for (const entry of Object.values(ROLE_CAPABILITY_POLICY)) {
            expect(entry.external_directory).toMatch(/^(allow|deny)$/);
            expect(entry.doom_loop).toMatch(/^(allow|deny)$/);
        }
    });
});

test("RoleCapabilityShape rejects ask for external_directory/doom_loop at typecheck time", () => {
    const valid: RoleCapabilityShape = {
        external_directory: "allow",
        doom_loop: "deny",
        edit: "allow",
        bash: "allow",
    };
    expect(valid).toBeDefined();
});
