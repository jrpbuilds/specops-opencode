import { afterEach, describe, expect, test } from "bun:test";
import { createTodoSyncHook } from "../../src/host/todo-sync.js";
import {
    __resetSessionBindingsForTesting,
    markImplementationEntered,
    recordSessionBinding,
} from "../../src/host/session-bindings.js";
import {
    __resetParallelProgressForTesting,
    createSessionEventObserver,
    recordTaskDispatch,
    recordTaskResult,
} from "../../src/host/parallel-progress.js";
import type { NormalizedApplyInstructionContext } from "../../src/openspec/apply-instructions.js";
import type { ApplyInstructionsResult } from "../../src/openspec/apply-instructions.js";
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

/** An apply context with 12 tasks and `complete` of them checked. */
function applyContext(
    complete = 0,
    state: NormalizedApplyInstructionContext["state"] = "ready",
): ApplyInstructionsResult {
    return {
        ok: true,
        context: {
            changeName: "example",
            changeDir: "openspec/changes/example",
            schemaName: "spec-driven",
            contextFiles: {},
            progress: { total: 12, complete, remaining: 12 - complete },
            tasks: [],
            state,
            instruction: "",
        },
    };
}

function hookWith(
    statusResult: OpenSpecStatusResult,
    applyResult: ApplyInstructionsResult = applyContext(),
) {
    return createTodoSyncHook({
        directory: "/project",
        getOpenSpecStatus: async () => statusResult,
        getApplyInstructions: async () => applyResult,
    });
}

function hookInput(tool: string, sessionID: string) {
    return { tool, sessionID, callID: "call_1", args: undefined };
}

/** Fire the contract's blind refresh trigger and return the published todos. */
async function fireTrigger(
    hook: ReturnType<typeof createTodoSyncHook>,
    sessionID = "ses_1",
): Promise<ModelTodo[]> {
    const output = { args: { todos: [] as ModelTodo[] } };
    await hook(hookInput("todowrite", sessionID), output);
    return output.args.todos;
}

function byId(todos: readonly ModelTodo[]): Map<string, ModelTodo> {
    return new Map(todos.map(todo => [todo.id as string, todo]));
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
            getApplyInstructions: async () => applyContext(),
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
            getApplyInstructions: async () => applyContext(),
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
            getApplyInstructions: async () => applyContext(),
        });

        await hook(hookInput("todowrite", "ses_1"), output);

        expect(reads).toEqual([["example", "/project"]]);
        expect(output.args).toBe(args);
        expect(args.todos).toEqual([
            {
                id: "planning:proposal",
                content: "Author proposal — define the change's purpose and scope",
                status: "completed",
                priority: "medium",
            },
            {
                id: "planning:tasks",
                content: "Plan tasks — break the work into implementation steps",
                status: "completed",
                priority: "medium",
            },
            {
                id: "plan-approval",
                content: "Approve plan — checkpoint to approve or reject the plan",
                status: "in_progress",
                priority: "medium",
            },
            {
                id: "implementation",
                content: "Implementation — build the approved tasks",
                status: "pending",
                priority: "medium",
            },
            {
                id: "independent-review",
                content: "Independent review — verify against specs and design",
                status: "pending",
                priority: "medium",
            },
            {
                id: "lifecycle-remediation",
                content: "Complete change — archive or remediate",
                status: "pending",
                priority: "medium",
            },
        ]);
    });

    test("publishes with the binding's coordinator mode", async () => {
        recordSessionBinding("ses_auto", "SpecOps Auto", "example");
        const hook = hookWith(okStatus());

        const todos = await fireTrigger(hook, "ses_auto");

        expect(todos.map(item => item.id)).toEqual([
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
            getApplyInstructions: async () => applyContext(),
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
        let applyReads = 0;
        const hook = createTodoSyncHook({
            directory: "/project",
            getOpenSpecStatus: async () => ({ ok: false, error: "no such change" }),
            getApplyInstructions: async () => {
                applyReads += 1;
                return applyContext();
            },
        });

        await hook(hookInput("todowrite", "ses_1"), output);

        expect(applyReads).toBe(0);
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
            getApplyInstructions: async () => applyContext(),
        });

        await hook(hookInput("todowrite", "ses_1"), output);

        expect(args.todos).toEqual([{ content: "model item", status: "pending", priority: "low" }]);
    });

    test("never throws on malformed hook output shapes", async () => {
        recordSessionBinding("ses_1", "SpecOps", "example");
        const hook = hookWith(okStatus());

        await hook(hookInput("todowrite", "ses_1"), undefined as never);
        await hook(hookInput("todowrite", "ses_1"), { args: "not-an-object" } as never);
        await hook(hookInput("todowrite", "ses_1"), { args: [1, 2, 3] } as never);
    });

    test("publication never decorates the payload with the refresh marker", async () => {
        // Loop safety: the marker lives only on lifecycle tool outputs. A
        // todowrite call publishes the canonical projection through payload
        // replacement, so the model-visible result of todowrite carries no
        // marker and cannot re-trigger itself.
        recordSessionBinding("ses_1", "SpecOps", "example");
        const args: { todos: ModelTodo[] } = { todos: [] };
        const output = { args };
        const hook = hookWith(okStatus());

        await hook(hookInput("todowrite", "ses_1"), output);

        expect(output.args).toBe(args);
        expect(output.args.todos.length).toBeGreaterThan(0);
        expect(JSON.stringify(output.args.todos)).not.toContain("SPECOPS_TODO_REFRESH");
    });
});

describe("createTodoSyncHook lifecycle advancement", () => {
    test("keeps the approval checkpoint current while no task is checked", async () => {
        recordSessionBinding("ses_1", "SpecOps", "example");
        const hook = hookWith(okStatus(), applyContext(0));

        const todos = await fireTrigger(hook);

        expect(byId(todos).get("plan-approval")?.status).toBe("in_progress");
        expect(byId(todos).get("implementation")?.status).toBe("pending");
    });

    test("advances to implementation once a task checkbox lands", async () => {
        recordSessionBinding("ses_1", "SpecOps", "example");
        const hook = hookWith(okStatus(), applyContext(3));

        const todos = await fireTrigger(hook);

        expect(byId(todos).get("plan-approval")?.status).toBe("completed");
        expect(byId(todos).get("implementation")?.status).toBe("in_progress");
        expect(byId(todos).get("independent-review")?.status).toBe("pending");
    });

    test("advances to review once every task is done", async () => {
        recordSessionBinding("ses_1", "SpecOps", "example");
        const hook = hookWith(okStatus(), applyContext(12, "all_done"));

        const todos = await fireTrigger(hook);

        expect(byId(todos).get("plan-approval")?.status).toBe("completed");
        expect(byId(todos).get("implementation")?.status).toBe("completed");
        expect(byId(todos).get("independent-review")?.status).toBe("in_progress");
        expect(byId(todos).get("lifecycle-remediation")?.status).toBe("pending");
    });

    test("the implementation-entry gate advances the projection before any checkbox", async () => {
        recordSessionBinding("ses_1", "SpecOps", "example");
        markImplementationEntered("ses_1");
        const hook = hookWith(okStatus(), applyContext(0));

        const todos = await fireTrigger(hook);

        expect(byId(todos).get("plan-approval")?.status).toBe("completed");
        expect(byId(todos).get("implementation")?.status).toBe("in_progress");
    });

    test("observing the apply-instructions call marks the gate for the next trigger", async () => {
        recordSessionBinding("ses_1", "SpecOps", "example");
        const hook = hookWith(okStatus(), applyContext(0));

        await hook(
            { tool: "specops_apply_instructions", sessionID: "ses_1", callID: "gate" },
            { args: { todos: [] } },
        );
        const todos = await fireTrigger(hook);

        expect(byId(todos).get("plan-approval")?.status).toBe("completed");
        expect(byId(todos).get("implementation")?.status).toBe("in_progress");
    });

    test("an apply-context read failure degrades to the waiting projection", async () => {
        recordSessionBinding("ses_1", "SpecOps", "example");
        const hook = hookWith(okStatus(), { ok: false, error: "openspec instructions failed" });

        const todos = await fireTrigger(hook);

        expect(byId(todos).get("plan-approval")?.status).toBe("in_progress");
        expect(byId(todos).get("implementation")?.status).toBe("pending");
    });

    test("a blocked apply state keeps the waiting projection", async () => {
        recordSessionBinding("ses_1", "SpecOps", "example");
        const hook = hookWith(okStatus(), applyContext(0, "blocked"));

        const todos = await fireTrigger(hook);

        expect(byId(todos).get("plan-approval")?.status).toBe("in_progress");
        expect(byId(todos).get("implementation")?.status).toBe("pending");
    });
});

describe("createTodoSyncHook parallel progress", () => {
    afterEach(() => {
        __resetParallelProgressForTesting();
    });

    /** Record one background implementer dispatch through the tracker seams. */
    async function dispatchImplementer(callID: string, taskOutput: string): Promise<void> {
        await recordTaskDispatch(
            { tool: "task", sessionID: "ses_1", callID },
            { args: { subagent_type: "specops-implementer" } },
        );
        await recordTaskResult(
            { tool: "task", sessionID: "ses_1", callID, args: { background: true } },
            { title: "", output: taskOutput, metadata: {} },
        );
    }

    test("splices runtime-observed parallel entries after their anchor stages", async () => {
        recordSessionBinding("ses_1", "SpecOps", "example");
        await dispatchImplementer("c1", '<task id="task-1" state="running">');
        await recordTaskDispatch(
            { tool: "task", sessionID: "ses_1", callID: "c2" },
            { args: { subagent_type: "specops-review-correctness" } },
        );
        const hook = hookWith(okStatus());

        const todos = await fireTrigger(hook);
        const ids = todos.map(todo => todo.id);

        expect(ids.indexOf("implementer:task-1")).toBe(ids.indexOf("implementation") + 1);
        expect(ids.indexOf("review-critic:correctness")).toBe(
            ids.indexOf("independent-review") + 1,
        );
        expect(byId(todos).get("implementer:task-1")).toEqual({
            id: "implementer:task-1",
            content: "Implementer dispatch (task-1)",
            status: "in_progress",
            priority: "medium",
        });
        expect(byId(todos).get("review-critic:correctness")).toEqual({
            id: "review-critic:correctness",
            content: "Review critic: correctness",
            status: "in_progress",
            priority: "medium",
        });
    });

    test("terminal dispatches are omitted — durable stages carry completion", async () => {
        recordSessionBinding("ses_1", "SpecOps", "example");
        // A foreground dispatch resolved at its tool result.
        await recordTaskDispatch(
            { tool: "task", sessionID: "ses_1", callID: "c1" },
            { args: { subagent_type: "specops-implementer" } },
        );
        await recordTaskResult(
            { tool: "task", sessionID: "ses_1", callID: "c1", args: {} },
            { title: "", output: "done", metadata: {} },
        );
        // A background dispatch failed through its session error event.
        await dispatchImplementer("c2", '<task id="task-2" state="running">');
        await createSessionEventObserver()({
            event: { type: "session.error", properties: { sessionID: "task-2" } },
        } as never);
        const hook = hookWith(okStatus());

        const todos = await fireTrigger(hook);

        expect(todos.some(todo => String(todo.id).startsWith("implementer:"))).toBe(false);
    });

    test("publishes no parallel entries when nothing was observed", async () => {
        recordSessionBinding("ses_1", "SpecOps", "example");
        const hook = hookWith(okStatus());

        const todos = await fireTrigger(hook);

        expect(todos.some(todo => String(todo.id).startsWith("implementer:"))).toBe(false);
        expect(todos.some(todo => String(todo.id).startsWith("review-critic:"))).toBe(false);
    });
});
