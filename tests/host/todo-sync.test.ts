import { afterEach, describe, expect, test } from "bun:test";
import { createTodoSyncHook } from "../../src/host/todo-sync.js";
import {
    __resetSessionBindingsForTesting,
    recordSessionBinding,
} from "../../src/host/session-bindings.js";
import type { NormalizedArtifact } from "../../src/openspec/status.js";
import type { OpenSpecStatusResult } from "../../src/openspec/status.js";

/** A model-authored todo as the native todowrite schema accepts it. */
type ModelTodo = { id?: string; content: string; status: string; priority: string };

function artifact(
    id: string,
    status: NormalizedArtifact["status"],
    requires: readonly string[] = [],
): NormalizedArtifact {
    return { id, outputPath: `openspec/changes/example/${id}.md`, status, requires };
}

function okStatus(): OpenSpecStatusResult {
    return {
        ok: true,
        status: {
            changeName: "example",
            schemaName: "spec-driven",
            isPlanningComplete: true,
            applyRequires: ["proposal", "tasks"],
            artifacts: [artifact("proposal", "done"), artifact("tasks", "done", ["proposal"])],
        },
    };
}

function hookInput(tool: string, sessionID: string) {
    return { tool, sessionID, callID: "call_1" };
}

afterEach(() => {
    __resetSessionBindingsForTesting();
});

describe("createTodoSyncHook", () => {
    test("leaves non-todowrite tool calls untouched", async () => {
        const args = { todos: [{ content: "model item", status: "pending", priority: "low" }] };
        const output = { args };
        let reads = 0;
        const hook = createTodoSyncHook({
            directory: "/project",
            getOpenSpecStatus: async () => {
                reads += 1;
                return okStatus();
            },
        });

        await hook(hookInput("bash", "ses_1"), output);

        expect(reads).toBe(0);
        expect(output.args.todos).toEqual([
            { content: "model item", status: "pending", priority: "low" },
        ]);
    });

    test("leaves sessions without a SpecOps binding untouched", async () => {
        const args = { todos: [{ content: "model item", status: "pending", priority: "low" }] };
        const output = { args };
        let reads = 0;
        const hook = createTodoSyncHook({
            directory: "/project",
            getOpenSpecStatus: async () => {
                reads += 1;
                return okStatus();
            },
        });

        await hook(hookInput("todowrite", "ses_unbound"), output);

        expect(reads).toBe(0);
        expect(output.args.todos).toEqual([
            { content: "model item", status: "pending", priority: "low" },
        ]);
    });

    test("replaces the todowrite payload in place with the canonical projection", async () => {
        recordSessionBinding("ses_1", "SpecOps", "example");
        const args: { todos: ModelTodo[] } = {
            todos: [{ content: "model item", status: "pending", priority: "low" }],
        };
        const output = { args };
        const reads: Array<[string, string]> = [];
        const hook = createTodoSyncHook({
            directory: "/project",
            getOpenSpecStatus: async (change, cwd) => {
                reads.push([change, cwd]);
                return okStatus();
            },
        });

        await hook(hookInput("todowrite", "ses_1"), output);

        expect(reads).toEqual([["example", "/project"]]);
        expect(output.args).toBe(args);
        expect(args.todos).toEqual([
            {
                id: "planning:proposal",
                content: "proposal",
                status: "completed",
                priority: "medium",
            },
            { id: "planning:tasks", content: "tasks", status: "completed", priority: "medium" },
            {
                id: "plan-approval",
                content: "Plan approval checkpoint",
                status: "in_progress",
                priority: "medium",
            },
            {
                id: "implementation",
                content: "Implementation",
                status: "pending",
                priority: "medium",
            },
            {
                id: "independent-review",
                content: "Independent review",
                status: "pending",
                priority: "medium",
            },
            {
                id: "lifecycle-remediation",
                content: "Lifecycle/remediation",
                status: "pending",
                priority: "medium",
            },
        ]);
    });

    test("publishes with the binding's coordinator mode", async () => {
        recordSessionBinding("ses_auto", "SpecOps Auto", "example");
        const output = { args: { todos: [] as ModelTodo[] } };
        const hook = createTodoSyncHook({
            directory: "/project",
            getOpenSpecStatus: async () => okStatus(),
        });

        await hook(hookInput("todowrite", "ses_auto"), output);

        expect(output.args.todos.map(item => item.id)).toEqual([
            "planning:proposal",
            "planning:tasks",
            "implementation",
            "independent-review",
            "auto-review-remediation",
            "auto-review-re-review",
            "lifecycle-remediation",
        ]);
    });

    test("reads fresh durable state on every call", async () => {
        recordSessionBinding("ses_1", "SpecOps", "example");
        let remaining = 2;
        const hook = createTodoSyncHook({
            directory: "/project",
            getOpenSpecStatus: async () => {
                remaining -= 1;
                return {
                    ok: true,
                    status: {
                        changeName: "example",
                        schemaName: "spec-driven",
                        isPlanningComplete: true,
                        applyRequires: ["proposal", "tasks"],
                        artifacts:
                            remaining > 0
                                ? [
                                      artifact("proposal", "done"),
                                      artifact("tasks", "ready", ["proposal"]),
                                  ]
                                : [
                                      artifact("proposal", "done"),
                                      artifact("tasks", "done", ["proposal"]),
                                  ],
                    },
                };
            },
        });
        const first: { args: { todos: { id: string }[] } } = { args: { todos: [] } };
        const second: { args: { todos: { id: string }[] } } = { args: { todos: [] } };

        await hook(hookInput("todowrite", "ses_1"), first);
        await hook(hookInput("todowrite", "ses_1"), second);

        expect(first.args.todos.map(item => item.id)).not.toContain("plan-approval");
        expect(second.args.todos.map(item => item.id)).toContain("plan-approval");
    });

    test("passes through when the durable status read fails", async () => {
        recordSessionBinding("ses_1", "SpecOps", "example");
        const args = { todos: [{ content: "model item", status: "pending", priority: "low" }] };
        const output = { args };
        const hook = createTodoSyncHook({
            directory: "/project",
            getOpenSpecStatus: async () => ({ ok: false, error: "no such change" }),
        });

        await hook(hookInput("todowrite", "ses_1"), output);

        expect(output.args).toBe(args);
        expect(args.todos).toEqual([{ content: "model item", status: "pending", priority: "low" }]);
    });

    test("never throws when the status reader rejects", async () => {
        recordSessionBinding("ses_1", "SpecOps", "example");
        const args = { todos: [{ content: "model item", status: "pending", priority: "low" }] };
        const output = { args };
        const hook = createTodoSyncHook({
            directory: "/project",
            getOpenSpecStatus: async () => {
                throw new Error("openspec exploded");
            },
        });

        await hook(hookInput("todowrite", "ses_1"), output);

        expect(args.todos).toEqual([{ content: "model item", status: "pending", priority: "low" }]);
    });

    test("never throws on malformed hook output shapes", async () => {
        recordSessionBinding("ses_1", "SpecOps", "example");
        const hook = createTodoSyncHook({
            directory: "/project",
            getOpenSpecStatus: async () => okStatus(),
        });

        await hook(hookInput("todowrite", "ses_1"), undefined as never);
        await hook(hookInput("todowrite", "ses_1"), { args: "not-an-object" } as never);
        await hook(hookInput("todowrite", "ses_1"), { args: [1, 2, 3] } as never);
    });
});
