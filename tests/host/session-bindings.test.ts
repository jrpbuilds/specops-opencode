import { afterEach, describe, expect, test } from "bun:test";
import {
    __resetSessionBindingsForTesting,
    clearArchivedChange,
    getRememberedTodoProjection,
    getSessionBinding,
    hasArchivedChange,
    recordArchivedChange,
    recordSessionBinding,
    rememberTodoProjection,
} from "../../src/host/session-bindings.js";

afterEach(() => {
    __resetSessionBindingsForTesting();
});

describe("session bindings", () => {
    test("records the interactive orchestrator with its change name", () => {
        recordSessionBinding("ses_1", "SpecOps", "example");

        expect(getSessionBinding("ses_1")).toEqual({ change: "example", mode: "interactive" });
    });

    test("records the auto orchestrator with auto mode", () => {
        recordSessionBinding("ses_2", "SpecOps Auto", "example");

        expect(getSessionBinding("ses_2")).toEqual({ change: "example", mode: "auto" });
    });

    test("ignores non-SpecOps agents so ordinary sessions are never intercepted", () => {
        recordSessionBinding("ses_3", "build", "example");
        recordSessionBinding("ses_4", "test-agent", "example");
        recordSessionBinding("ses_5", "specops-explorer", "example");

        expect(getSessionBinding("ses_3")).toBeUndefined();
        expect(getSessionBinding("ses_4")).toBeUndefined();
        expect(getSessionBinding("ses_5")).toBeUndefined();
    });

    test("ignores empty session ids and empty change names", () => {
        recordSessionBinding("", "SpecOps", "example");
        recordSessionBinding("ses_6", "SpecOps", "   ");

        expect(getSessionBinding("ses_6")).toBeUndefined();
    });

    test("the latest lifecycle call wins when a session switches changes or modes", () => {
        recordSessionBinding("ses_7", "SpecOps", "first");
        recordSessionBinding("ses_7", "SpecOps", "second");
        expect(getSessionBinding("ses_7")).toEqual({ change: "second", mode: "interactive" });

        recordSessionBinding("ses_7", "SpecOps Auto", "second");
        expect(getSessionBinding("ses_7")).toEqual({ change: "second", mode: "auto" });
    });

    test("returns undefined for unknown sessions", () => {
        expect(getSessionBinding("ses_never")).toBeUndefined();
    });
});

describe("archived projection finalization", () => {
    test("recordArchivedChange finalizes the remembered projection to all-complete", () => {
        recordSessionBinding("ses_8", "SpecOps", "example");
        rememberTodoProjection("ses_8", [
            {
                id: "implementation",
                content: "Implementation — build the approved tasks",
                status: "in_progress",
                priority: "medium",
            },
            {
                id: "lifecycle-remediation",
                content: "Complete change — archive or remediate",
                status: "pending",
                priority: "medium",
            },
        ]);

        recordArchivedChange("ses_8");

        expect(getRememberedTodoProjection("ses_8")).toEqual([
            {
                id: "implementation",
                content: "Implementation — build the approved tasks",
                status: "completed",
                priority: "medium",
            },
            {
                id: "lifecycle-remediation",
                content: "Complete change — archive or remediate",
                status: "completed",
                priority: "medium",
            },
        ]);
    });

    test("recordArchivedChange without a remembered projection finalizes nothing", () => {
        recordSessionBinding("ses_9", "SpecOps", "example");

        recordArchivedChange("ses_9");

        expect(getRememberedTodoProjection("ses_9")).toBeUndefined();
    });

    test("the archive flag is observable and clearable per session", () => {
        recordSessionBinding("ses_10", "SpecOps", "example");

        expect(hasArchivedChange("ses_10")).toBe(false);
        recordArchivedChange("ses_10");
        expect(hasArchivedChange("ses_10")).toBe(true);

        clearArchivedChange("ses_10");
        expect(hasArchivedChange("ses_10")).toBe(false);
    });

    test("switching change or mode clears the archive flag", () => {
        recordSessionBinding("ses_11", "SpecOps", "example");
        recordArchivedChange("ses_11");
        expect(hasArchivedChange("ses_11")).toBe(true);

        recordSessionBinding("ses_11", "SpecOps", "next-change");
        expect(hasArchivedChange("ses_11")).toBe(false);

        recordArchivedChange("ses_11");
        recordSessionBinding("ses_11", "SpecOps Auto", "next-change");
        expect(hasArchivedChange("ses_11")).toBe(false);
    });

    test("re-binding the same change and mode keeps the archive flag", () => {
        recordSessionBinding("ses_12", "SpecOps", "example");
        recordArchivedChange("ses_12");

        recordSessionBinding("ses_12", "SpecOps", "example");

        expect(hasArchivedChange("ses_12")).toBe(true);
    });
});
