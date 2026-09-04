import { afterEach, describe, expect, test } from "bun:test";
import { createTodoDisplayHook } from "../../src/host/todo-display.js";
import {
    __resetSessionBindingsForTesting,
    recordSessionBinding,
} from "../../src/host/session-bindings.js";

function hookInput(tool: string, sessionID: string) {
    return { tool, sessionID, callID: "call_1", args: undefined };
}

afterEach(() => {
    __resetSessionBindingsForTesting();
});

describe("createTodoDisplayHook", () => {
    test("leaves non-todowrite tool calls untouched", async () => {
        const output = { title: "Todos", output: "ok", metadata: { todos: [{ id: "x" }] } };
        const hook = createTodoDisplayHook();

        await hook(hookInput("bash", "ses_1"), output);

        expect(output.metadata.todos).toEqual([{ id: "x" }]);
    });

    test("leaves sessions without a SpecOps binding untouched", async () => {
        const output = { title: "Todos", output: "ok", metadata: { todos: [{ id: "x" }] } };
        const hook = createTodoDisplayHook();

        await hook(hookInput("todowrite", "ses_unbound"), output);

        expect(output.metadata.todos).toEqual([{ id: "x" }]);
    });

    test("empties the display metadata todos for bound sessions in place", async () => {
        recordSessionBinding("ses_1", "SpecOps", "example");
        const metadata = { todos: [{ id: "planning:proposal", status: "completed" }] };
        const output = { title: "Todos", output: "ok", metadata };
        const hook = createTodoDisplayHook();

        await hook(hookInput("todowrite", "ses_1"), output);

        expect(output.metadata).toBe(metadata);
        expect(metadata.todos).toEqual([]);
    });

    test("suppression applies to the auto coordinator mode", async () => {
        recordSessionBinding("ses_auto", "SpecOps Auto", "example");
        const output = {
            title: "Todos",
            output: "ok",
            metadata: { todos: [{ id: "implementation" }] },
        };
        const hook = createTodoDisplayHook();

        await hook(hookInput("todowrite", "ses_auto"), output);

        expect(output.metadata.todos).toEqual([]);
    });

    test("no-ops when the metadata is absent or malformed", async () => {
        recordSessionBinding("ses_1", "SpecOps", "example");
        const hook = createTodoDisplayHook();

        await hook(hookInput("todowrite", "ses_1"), undefined as never);
        await hook(hookInput("todowrite", "ses_1"), { metadata: null } as never);
        await hook(hookInput("todowrite", "ses_1"), { metadata: "not-an-object" } as never);
        await hook(hookInput("todowrite", "ses_1"), { metadata: [1, 2, 3] } as never);
    });
});
