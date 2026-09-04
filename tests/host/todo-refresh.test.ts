import { describe, expect, test } from "bun:test";
import {
    SPECOPS_TODO_REFRESH,
    withTodoRefreshReminder,
} from "../../src/host/tools/todo-refresh.js";

/**
 * Unit contract for the compact Todo refresh directive.
 *
 * The marker is a stable directive, never prose: it is appended once, is
 * idempotent under re-decoration (so it can never cascade into a refresh
 * loop), and rides after JSON payloads without mutating them.
 */
describe("withTodoRefreshReminder", () => {
    test("terminates a plain output with exactly one compact marker", () => {
        const output = withTodoRefreshReminder("OpenSpec change 'example' created successfully.");

        expect(output).toBe(
            "OpenSpec change 'example' created successfully.\n\n" + SPECOPS_TODO_REFRESH,
        );
        expect(output.split(SPECOPS_TODO_REFRESH)).toHaveLength(2);
    });

    test("appends after a JSON payload without mutating the payload", () => {
        const payload = JSON.stringify({ ok: true, action: "continue_planning" });
        const output = withTodoRefreshReminder(payload);

        expect(output.startsWith(payload)).toBe(true);
        expect(output.endsWith(SPECOPS_TODO_REFRESH)).toBe(true);
        expect(JSON.parse(payload)).toEqual({ ok: true, action: "continue_planning" });
    });

    test("is idempotent, so decoration can never create a refresh loop", () => {
        const once = withTodoRefreshReminder("status payload");
        const twice = withTodoRefreshReminder(once);

        expect(twice).toBe(once);
        expect(twice.split(SPECOPS_TODO_REFRESH)).toHaveLength(2);
    });
});
