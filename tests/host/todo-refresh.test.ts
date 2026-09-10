import { afterEach, describe, expect, test } from "bun:test";
import {
    createTaskResultRefreshHook,
    SPECOPS_TODO_REFRESH,
    withTodoRefreshReminder,
} from "../../src/host/tools/todo-refresh.js";
import {
    __resetSessionBindingsForTesting,
    recordSessionBinding,
} from "../../src/host/session-bindings.js";

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

    test("coalesces bound lifecycle markers within one assistant message", () => {
        recordSessionBinding("ses_1", "SpecOps", "example");
        const context = { sessionID: "ses_1", messageID: "message_1" };

        const first = withTodoRefreshReminder("status payload", context);
        const second = withTodoRefreshReminder("validation payload", context);
        const nextMessage = withTodoRefreshReminder("next payload", {
            ...context,
            messageID: "message_2",
        });

        expect(first.endsWith(SPECOPS_TODO_REFRESH)).toBe(true);
        expect(second).toBe("validation payload");
        expect(nextMessage.endsWith(SPECOPS_TODO_REFRESH)).toBe(true);
    });

    test("does not coalesce unbound lifecycle output", () => {
        const context = { sessionID: "ses_unbound", messageID: "message_1" };

        expect(withTodoRefreshReminder("first", context)).toContain(SPECOPS_TODO_REFRESH);
        expect(withTodoRefreshReminder("second", context)).toContain(SPECOPS_TODO_REFRESH);
    });
});

afterEach(() => {
    __resetSessionBindingsForTesting();
});

describe("createTaskResultRefreshHook", () => {
    test("cues a bound coordinator after a specialist result", async () => {
        recordSessionBinding("ses_1", "SpecOps", "example");
        const output = {
            title: "Task",
            output: '<task id="dispatch-1" state="completed">done</task>',
            metadata: {},
        };

        await createTaskResultRefreshHook()(
            { tool: "task", sessionID: "ses_1", callID: "call_1", args: {} },
            output,
        );

        expect(output.output).toContain('<task id="dispatch-1" state="completed">');
        expect(output.output.endsWith(SPECOPS_TODO_REFRESH)).toBe(true);
    });

    test("leaves non-task and unbound results untouched", async () => {
        const hook = createTaskResultRefreshHook();
        const unbound = { title: "Task", output: "result", metadata: {} };
        const other = { title: "Shell", output: "result", metadata: {} };

        await hook({ tool: "task", sessionID: "ses_unbound", callID: "call_1", args: {} }, unbound);
        await hook({ tool: "bash", sessionID: "ses_unbound", callID: "call_2", args: {} }, other);

        expect(unbound.output).toBe("result");
        expect(other.output).toBe("result");
    });

    test("does not duplicate a cue already present in a task result", async () => {
        recordSessionBinding("ses_1", "SpecOps", "example");
        const output = { title: "Task", output: `result\n\n${SPECOPS_TODO_REFRESH}`, metadata: {} };

        await createTaskResultRefreshHook()(
            { tool: "task", sessionID: "ses_1", callID: "call_1", args: {} },
            output,
        );

        expect(output.output.split(SPECOPS_TODO_REFRESH)).toHaveLength(2);
    });
});
