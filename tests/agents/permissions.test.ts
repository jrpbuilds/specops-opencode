import { describe, expect, test } from "bun:test";
import {
    COORDINATOR_PERMISSION,
    DESIGNER_PERMISSION,
    EXPLORER_PERMISSION,
    FRONTIER_PERMISSION,
    IMPLEMENTER_PERMISSION,
    ORDINARY_LIFECYCLE_PERMISSION,
    PLANNER_PERMISSION,
    REVIEWER_PERMISSION,
    SPECOPS_LIFECYCLE_PERMISSION,
    SPECOPS_TASK_ALLOW,
    SPECOPS_TASK_DENY,
    SPECOPS_TASK_GLOB,
    denyTaskGlob,
} from "../../src/agents/permissions.js";

describe("role permission profiles", () => {
    test("does not retain execution-mode permission exports", async () => {
        const permissions = await import("../../src/agents/permissions.js");
        expect(Object.keys(permissions)).not.toContain("SPECOPS_AUTO_PERMISSION");
    });

    test("gives coordinators help-only shell and lifecycle authority", () => {
        expect(COORDINATOR_PERMISSION).toMatchObject({
            external_directory: "deny",
            doom_loop: "deny",
            edit: { "*": "deny" },
            bash: {
                "*": "deny",
                "openspec --help": "allow",
                "openspec * --help": "allow",
            },
            [SPECOPS_LIFECYCLE_PERMISSION]: "allow",
        });
    });

    test("keeps critical role capability fields explicit", () => {
        expect(COORDINATOR_PERMISSION.edit).toEqual({ "*": "deny" });
        expect(COORDINATOR_PERMISSION.bash).toEqual({
            "*": "deny",
            "openspec --help": "allow",
            "openspec * --help": "allow",
        });
        expect(COORDINATOR_PERMISSION.external_directory).toBe("deny");
        expect(COORDINATOR_PERMISSION.doom_loop).toBe("deny");

        expect(EXPLORER_PERMISSION.edit).toEqual({ "*": "deny" });
        expect(EXPLORER_PERMISSION.bash).toBe("deny");
        expect(FRONTIER_PERMISSION.edit).toEqual({ "*": "deny" });
        expect(FRONTIER_PERMISSION.bash).toBe("deny");

        const planningEdit = {
            "*": "deny",
            "openspec/**": "allow",
            "**/openspec/**": "allow",
        } as const;
        const planningBash = {
            "*": "deny",
            "openspec instructions *": "allow",
            "openspec validate *": "allow",
        } as const;
        expect(PLANNER_PERMISSION.edit).toEqual(planningEdit);
        expect(PLANNER_PERMISSION.bash).toEqual(planningBash);
        expect(DESIGNER_PERMISSION.edit).toEqual(planningEdit);
        expect(DESIGNER_PERMISSION.bash).toEqual(planningBash);

        expect(IMPLEMENTER_PERMISSION.edit).toBe("allow");
        expect(IMPLEMENTER_PERMISSION.bash).toBe("allow");
        expect(IMPLEMENTER_PERMISSION.external_directory).toBe("allow");
        expect(IMPLEMENTER_PERMISSION.doom_loop).toBe("allow");

        // Reviewer bash remains unrestricted, so shell-side mutation is still possible.
        expect(REVIEWER_PERMISSION.edit).toEqual({ "*": "deny" });
        expect(REVIEWER_PERMISSION.bash).toBe("allow");
    });

    test("restricts ordinary lifecycle access to doctor and onboarding", () => {
        expect(ORDINARY_LIFECYCLE_PERMISSION).toEqual({
            "*": "deny",
            specops_doctor: "allow",
            specops_onboard: "allow",
        });
    });

    test("gives each specialist an explicit headless-safe role boundary", () => {
        for (const permission of [
            EXPLORER_PERMISSION,
            PLANNER_PERMISSION,
            DESIGNER_PERMISSION,
            IMPLEMENTER_PERMISSION,
            REVIEWER_PERMISSION,
            FRONTIER_PERMISSION,
        ]) {
            expect(permission.external_directory).toMatch(/^(allow|deny)$/);
            expect(permission.doom_loop).toMatch(/^(allow|deny)$/);
            expect(permission.question).toBe("deny");
            expect(permission.task).toEqual({ "*": "deny" });
            expect(permission[SPECOPS_LIFECYCLE_PERMISSION]).toBe("deny");
            expect(permission["specops_*"]).toBe("deny");
        }
    });
});

describe("SPECOPS_TASK_GLOB", () => {
    test("identifies the private specops namespace", () => {
        expect(SPECOPS_TASK_GLOB).toBe("specops-*");
    });

    test("deny and allow carry exactly the glob with the intended action", () => {
        expect(SPECOPS_TASK_DENY).toEqual({ "specops-*": "deny" });
        expect(SPECOPS_TASK_ALLOW).toEqual({ "*": "deny", "specops-*": "allow" });
        expect(Object.keys(SPECOPS_TASK_ALLOW)).toEqual(["*", "specops-*"]);
    });
});

describe("planner and designer edit scope", () => {
    function matchWildcard(input: string, pattern: string): boolean {
        const escaped = pattern
            .replaceAll("\\", "/")
            .replace(/[.+^${}()|[\]\\]/g, "\\$&")
            .replace(/\*/g, ".*")
            .replace(/\?/g, ".");
        return new RegExp(`^${escaped}$`, "s").test(input.replaceAll("\\", "/"));
    }

    function evaluateEdit(
        rules: Record<string, "allow" | "deny">,
        filePath: string,
    ): "allow" | "deny" {
        let action: "allow" | "deny" = "deny";
        for (const [pattern, effect] of Object.entries(rules)) {
            if (matchWildcard(filePath, pattern)) action = effect;
        }
        return action;
    }

    test("allows OpenSpec paths from git and non-git worktree roots", () => {
        const rules = {
            "*": "deny",
            "openspec/**": "allow",
            "**/openspec/**": "allow",
        } as const;
        for (const filePath of [
            "openspec/changes/neon-street-racer/proposal.md",
            "openspec/changes/neon-street-racer/specs/game/spec.md",
            "openspec/changes/neon-street-racer/tasks.md",
            "openspec/specs/game/spec.md",
            "openspec/project.md",
            "home/jake/Projects/tests/arcade-racer/openspec/changes/neon-street-racer/proposal.md",
            "home/jake/Projects/tests/arcade-racer/openspec/specs/game/spec.md",
        ]) {
            expect(evaluateEdit(rules, filePath)).toBe("allow");
        }
        expect(evaluateEdit(rules, "src/main.ts")).toBe("deny");
        expect(evaluateEdit(rules, "package.json")).toBe("deny");
        expect(evaluateEdit(rules, "home/jake/Projects/tests/arcade-racer/src/main.ts")).toBe(
            "deny",
        );
    });
});

describe("denyTaskGlob", () => {
    test("builds a bare deny map for undefined", () => {
        expect(denyTaskGlob(undefined, "specops-*")).toEqual({ "specops-*": "deny" });
    });

    test("normalizes a scalar allow into a star rule plus a trailing deny", () => {
        expect(denyTaskGlob("allow", "specops-*")).toEqual({ "*": "allow", "specops-*": "deny" });
        expect(Object.keys(denyTaskGlob("allow", "specops-*"))).toEqual(["*", "specops-*"]);
    });

    test("normalizes a scalar ask preserving the ask semantics", () => {
        expect(denyTaskGlob("ask", "specops-*")).toEqual({ "*": "ask", "specops-*": "deny" });
    });

    test("normalizes a scalar deny", () => {
        expect(denyTaskGlob("deny", "specops-*")).toEqual({ "*": "deny", "specops-*": "deny" });
    });

    test("preserves existing map entries and appends the deny glob last", () => {
        expect(denyTaskGlob({ "other-agent": "allow" }, "specops-*")).toEqual({
            "other-agent": "allow",
            "specops-*": "deny",
        });
    });

    test("deduplicates an existing glob key and re-orders it last", () => {
        expect(denyTaskGlob({ "specops-*": "allow", "other-agent": "allow" }, "specops-*")).toEqual(
            { "other-agent": "allow", "specops-*": "deny" },
        );
        expect(Object.keys(denyTaskGlob({ "specops-*": "allow" }, "specops-*"))).toEqual([
            "specops-*",
        ]);
    });

    test("falls back to a bare deny for non-object non-string values", () => {
        expect(denyTaskGlob(42, "specops-*")).toEqual({ "specops-*": "deny" });
        expect(denyTaskGlob(["specops-*"], "specops-*")).toEqual({ "specops-*": "deny" });
    });
});
