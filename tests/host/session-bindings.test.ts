import { afterEach, describe, expect, test } from "bun:test";
import {
    __resetSessionBindingsForTesting,
    getSessionBinding,
    recordSessionBinding,
} from "../../src/host/session-bindings.js";

afterEach(() => {
    __resetSessionBindingsForTesting();
});

describe("session bindings", () => {
    test("records the interactive coordinator with its change name", () => {
        recordSessionBinding("ses_1", "SpecOps", "example");

        expect(getSessionBinding("ses_1")).toEqual({ change: "example", mode: "interactive" });
    });

    test("records the auto coordinator with auto mode", () => {
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
