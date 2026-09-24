import { afterEach, describe, expect, test } from "bun:test";
import { createTodoSyncHook } from "../../src/host/todo-sync.js";
import { recordReviewDispatch, recordReviewResult } from "../../src/host/review-cycle.js";
import {
    __resetSessionBindingsForTesting,
    markImplementationEntered,
    recordArchivedChange,
    recordSessionBinding,
} from "../../src/host/session-bindings.js";
import type { ApplyInstructionsResult } from "../../src/openspec/apply-instructions.js";
import type { NormalizedArtifact, OpenSpecStatusResult } from "../../src/openspec/status.js";

/**
 * Representative workflow synchronization for the runtime-owned Todo
 * projection (#52).
 *
 * Each test drives the real publication hook through a scripted sequence of
 * durable OpenSpec states while the orchestrator fires only the blind refresh
 * trigger from the contract (`{"todos": []}`), verifying that the canonical
 * projection stays useful across a run: initial publish, transitions,
 * revisions, resume, failure recovery, and idempotence. Ephemeral parallel
 * implementation/review entries are derived from the runtime's observed
 * dispatches and included in the publication hook's full-run surface, and
 * the post-review stages advance from the runtime's observed review cycle —
 * verdicts, remediation rounds, and the terminal archive projection.
 */

/** A model-authored todo as the native todowrite schema accepts it. */
type ModelTodo = { id?: string; content: string; status: string; priority: string };

function artifact(
    id: string,
    status: NormalizedArtifact["status"],
    requires: readonly string[] = [],
): NormalizedArtifact {
    return { id, outputPath: `openspec/changes/example/${id}.md`, status, requires };
}

/** The spec-driven planning graph in its dependency order. */
function plan(
    proposal: NormalizedArtifact["status"],
    specs: NormalizedArtifact["status"],
    design: NormalizedArtifact["status"],
    tasks: NormalizedArtifact["status"],
    planningComplete = false,
): OpenSpecStatusResult {
    return {
        ok: true,
        status: {
            changeName: "example",
            schemaName: "spec-driven",
            isPlanningComplete: planningComplete,
            applyRequires: ["tasks"],
            artifacts: [
                artifact("proposal", proposal),
                artifact("specs", specs, ["proposal"]),
                artifact("design", design, ["specs"]),
                artifact("tasks", tasks, ["design"]),
            ],
        },
    };
}

/** An apply context with 12 tasks and `complete` of them checked. */
function applyContext(
    complete = 0,
    state: "blocked" | "all_done" | "ready" = "ready",
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

/** Build the publication hook over a scripted sequence of durable states. */
function scriptedHook(states: OpenSpecStatusResult[]) {
    let call = 0;
    return createTodoSyncHook({
        directory: "/project",
        getOpenSpecStatus: async () => {
            const state = states[Math.min(call, states.length - 1)];
            call += 1;
            return state;
        },
        getApplyInstructions: async () => applyContext(),
    });
}

/** Fire the contract's blind refresh trigger and return the published todos. */
async function fireTrigger(
    hook: ReturnType<typeof createTodoSyncHook>,
    sessionID = "ses_1",
    modelTodos: ModelTodo[] = [],
): Promise<ModelTodo[]> {
    const output = { args: { todos: modelTodos } };
    await hook({ tool: "todowrite", sessionID, callID: "call_1" }, output);
    return output.args.todos as ModelTodo[];
}

function byId(todos: readonly ModelTodo[]): Map<string, ModelTodo> {
    return new Map(todos.map(todo => [todo.id as string, todo]));
}

afterEach(() => {
    __resetSessionBindingsForTesting();
});

describe("representative workflow synchronization", () => {
    test("initial publish projects the planning graph before any stage exists", async () => {
        recordSessionBinding("ses_1", "SpecOps", "example");
        const hook = scriptedHook([plan("ready", "ready", "ready", "ready")]);

        const todos = await fireTrigger(hook);

        expect(todos.map(todo => todo.id)).toEqual([
            "planning:proposal",
            "planning:specs",
            "planning:design",
            "planning:tasks",
        ]);
        const entries = byId(todos);
        expect(entries.get("planning:proposal")?.status).toBe("in_progress");
        expect(entries.get("planning:specs")?.status).toBe("pending");
        expect(entries.get("planning:design")?.status).toBe("pending");
        expect(entries.get("planning:tasks")?.status).toBe("pending");
    });

    test("artifact completion advances the projection without stale entries", async () => {
        recordSessionBinding("ses_1", "SpecOps", "example");
        const hook = scriptedHook([
            plan("ready", "ready", "ready", "ready"),
            plan("done", "ready", "ready", "ready"),
            plan("done", "done", "ready", "ready"),
        ]);

        const initial = byId(await fireTrigger(hook));
        const afterProposal = byId(await fireTrigger(hook));
        const afterSpecs = byId(await fireTrigger(hook));

        expect(initial.get("planning:proposal")?.status).toBe("in_progress");
        expect(afterProposal.get("planning:proposal")?.status).toBe("completed");
        expect(afterProposal.get("planning:specs")?.status).toBe("in_progress");
        expect(afterSpecs.get("planning:specs")?.status).toBe("completed");
        expect(afterSpecs.get("planning:design")?.status).toBe("in_progress");
    });

    test("a planning revision regresses completed entries instead of leaving them stale", async () => {
        recordSessionBinding("ses_1", "SpecOps", "example");
        const hook = scriptedHook([
            plan("done", "done", "done", "ready"),
            // The designer revises a previously complete artifact back to ready.
            plan("done", "done", "ready", "ready"),
        ]);

        const beforeRevision = byId(await fireTrigger(hook));
        const afterRevision = byId(await fireTrigger(hook));

        expect(beforeRevision.get("planning:design")?.status).toBe("completed");
        expect(afterRevision.get("planning:design")?.status).toBe("in_progress");
        expect(afterRevision.get("planning:specs")?.status).toBe("completed");
        expect(afterRevision.get("planning:tasks")?.status).toBe("pending");
    });

    test("planning completion reveals the post-plan stages for the bound mode", async () => {
        recordSessionBinding("ses_1", "SpecOps", "example");
        recordSessionBinding("ses_auto", "SpecOps Auto", "example");
        const complete = plan("done", "done", "done", "done", true);
        const hook = scriptedHook([complete]);

        const interactive = await fireTrigger(hook);
        const auto = await fireTrigger(hook, "ses_auto");

        expect(interactive.map(todo => todo.id)).toEqual([
            "planning:proposal",
            "planning:specs",
            "planning:design",
            "planning:tasks",
            "plan-approval",
            "implementation",
            "independent-review",
            "lifecycle-remediation",
        ]);
        expect(byId(interactive).get("plan-approval")?.status).toBe("in_progress");
        expect(auto.map(todo => todo.id)).toEqual([
            "planning:proposal",
            "planning:specs",
            "planning:design",
            "planning:tasks",
            "implementation",
            "independent-review",
            "auto-review-remediation",
            "auto-review-re-review",
            "lifecycle-remediation",
        ]);
    });

    test("resume discards the session's stale payload and performs a full rebuild", async () => {
        recordSessionBinding("ses_1", "SpecOps", "example");
        const hook = scriptedHook([plan("done", "done", "done", "done", true)]);

        const stale = [
            { content: "old planning item", status: "completed", priority: "medium" },
            { content: "ghost review round", status: "in_progress", priority: "medium" },
        ];
        const todos = await fireTrigger(hook, "ses_1", stale);

        expect(todos.some(todo => todo.content === "old planning item")).toBe(false);
        expect(todos.some(todo => todo.content === "ghost review round")).toBe(false);
        expect(todos.map(todo => todo.id)).toEqual([
            "planning:proposal",
            "planning:specs",
            "planning:design",
            "planning:tasks",
            "plan-approval",
            "implementation",
            "independent-review",
            "lifecycle-remediation",
        ]);
    });

    test("a failed durable read degrades to the model list and the next trigger recovers", async () => {
        recordSessionBinding("ses_1", "SpecOps", "example");
        const hook = createTodoSyncHook({
            directory: "/project",
            getOpenSpecStatus: (index => async () =>
                index++ === 0
                    ? ({ ok: false, error: "openspec status failed" } as OpenSpecStatusResult)
                    : plan("done", "done", "done", "done", true))(0),
            getApplyInstructions: async () => applyContext(),
        });

        const modelTodos = [
            { content: "model item", status: "pending", priority: "low" },
        ] satisfies ModelTodo[];
        const degraded = await fireTrigger(hook, "ses_1", modelTodos);
        const recovered = await fireTrigger(hook);

        expect(degraded).toEqual(modelTodos);
        expect(recovered.map(todo => todo.id)).toContain("plan-approval");
    });

    test("repeated triggers over unchanged state publish identical projections", async () => {
        recordSessionBinding("ses_1", "SpecOps", "example");
        const hook = scriptedHook([plan("done", "done", "done", "done", true)]);

        const first = await fireTrigger(hook);
        const second = await fireTrigger(hook);

        expect(second).toEqual(first);
    });

    test("keeps ephemeral parallel implementation/review entries out until #53", async () => {
        recordSessionBinding("ses_1", "SpecOps", "example");
        recordSessionBinding("ses_auto", "SpecOps Auto", "example");
        const hook = scriptedHook([plan("done", "done", "done", "done", true)]);

        for (const sessionID of ["ses_1", "ses_auto"]) {
            const todos = await fireTrigger(hook, sessionID);
            expect(
                todos.some(
                    todo =>
                        (todo.id as string).startsWith("review-lane:") ||
                        (todo.id as string).startsWith("implementer:"),
                ),
            ).toBe(false);
        }
    });

    test("the lifecycle stages advance from gate through checkboxes to review", async () => {
        recordSessionBinding("ses_1", "SpecOps", "example");
        const complete = plan("done", "done", "done", "done", true);
        const applySequence = [
            applyContext(0),
            applyContext(0),
            applyContext(6),
            applyContext(12, "all_done"),
        ];
        let call = 0;
        const hook = createTodoSyncHook({
            directory: "/project",
            getOpenSpecStatus: async () => complete,
            getApplyInstructions: async () =>
                applySequence[Math.min(call++, applySequence.length - 1)],
        });

        const awaitingApproval = byId(await fireTrigger(hook));
        markImplementationEntered("ses_1");
        const atGate = byId(await fireTrigger(hook));
        const midImplementation = byId(await fireTrigger(hook));
        const atReview = byId(await fireTrigger(hook));

        expect(awaitingApproval.get("plan-approval")?.status).toBe("in_progress");
        expect(awaitingApproval.get("implementation")?.status).toBe("pending");
        expect(atGate.get("plan-approval")?.status).toBe("completed");
        expect(atGate.get("implementation")?.status).toBe("in_progress");
        expect(midImplementation.get("implementation")?.status).toBe("in_progress");
        expect(atReview.get("implementation")?.status).toBe("completed");
        expect(atReview.get("independent-review")?.status).toBe("in_progress");
    });
});

describe("review-cycle synchronization", () => {
    const complete = plan("done", "done", "done", "done", true);

    /** A publication hook over a constant durable state. */
    function steadyHook(status: OpenSpecStatusResult = complete) {
        return createTodoSyncHook({
            directory: "/project",
            getOpenSpecStatus: async () => status,
            getApplyInstructions: async () => applyContext(12, "all_done"),
        });
    }

    /** Observe one reviewer result through the runtime's after-hook seam. */
    function reviewerReturns(output: string, sessionID = "ses_1"): Promise<void> {
        return recordReviewResult(
            {
                tool: "task",
                sessionID,
                callID: "call_review",
                args: { subagent_type: "specops-reviewer" },
            },
            { title: "", output, metadata: {} },
        );
    }

    test("a PASS completes review and makes the archive step current", async () => {
        recordSessionBinding("ses_1", "SpecOps", "example");
        const hook = steadyHook();

        const duringReview = byId(await fireTrigger(hook));
        await reviewerReturns("PASS\nCompliance matrix:\n- R1 — VERIFIED");
        const afterPass = byId(await fireTrigger(hook));

        expect(duringReview.get("independent-review")?.status).toBe("in_progress");
        expect(duringReview.get("lifecycle-remediation")?.status).toBe("pending");
        expect(afterPass.get("independent-review")?.status).toBe("completed");
        expect(afterPass.get("lifecycle-remediation")?.status).toBe("in_progress");
    });

    test("an interactive FAIL keeps implementation complete and moves work to the terminal stage", async () => {
        recordSessionBinding("ses_1", "SpecOps", "example");
        const hook = steadyHook();

        await reviewerReturns("FAIL\nF1 — broken behaviour");
        const afterFail = byId(await fireTrigger(hook));

        expect(afterFail.get("implementation")?.status).toBe("completed");
        expect(afterFail.get("independent-review")?.status).toBe("completed");
        expect(afterFail.get("lifecycle-remediation")?.status).toBe("in_progress");
    });

    test("an auto FAIL routes work through remediation, re-review, and back to terminal", async () => {
        recordSessionBinding("ses_auto", "SpecOps Auto", "example");
        const hook = steadyHook();

        await reviewerReturns("FAIL\nF1 — broken behaviour", "ses_auto");
        const afterFail = byId(await fireTrigger(hook, "ses_auto"));
        await recordReviewDispatch(
            { tool: "task", sessionID: "ses_auto", callID: "call_critic" },
            { args: { subagent_type: "specops-review-correctness" } },
        );
        const duringReReview = byId(await fireTrigger(hook, "ses_auto"));
        await reviewerReturns("PASS\nfixed", "ses_auto");
        const afterRePass = byId(await fireTrigger(hook, "ses_auto"));

        expect(afterFail.get("auto-review-remediation")?.status).toBe("in_progress");
        expect(afterFail.get("auto-review-re-review")?.status).toBe("pending");
        expect(duringReReview.get("auto-review-remediation")?.status).toBe("completed");
        expect(duringReReview.get("auto-review-re-review")?.status).toBe("in_progress");
        expect(afterRePass.get("auto-review-remediation")?.status).toBe("completed");
        expect(afterRePass.get("auto-review-re-review")?.status).toBe("completed");
        expect(afterRePass.get("lifecycle-remediation")?.status).toBe("in_progress");
    });

    test("implementation work after a PASS regresses the projection to durable state", async () => {
        recordSessionBinding("ses_1", "SpecOps", "example");
        // An update-flow revision after a passed review: fresh unchecked
        // tasks replace the completed list, and crossing the entry gate
        // clears the observed verdict so the durable phase governs again.
        let apply = applyContext(12, "all_done");
        const hook = createTodoSyncHook({
            directory: "/project",
            getOpenSpecStatus: async () => complete,
            getApplyInstructions: async () => apply,
        });

        await reviewerReturns("PASS\nok");
        observeGate();
        apply = applyContext(3);
        const afterGate = byId(await fireTrigger(hook));

        expect(afterGate.get("independent-review")?.status).toBe("pending");
        expect(afterGate.get("implementation")?.status).toBe("in_progress");
    });

    test("a successful archive publishes the terminal, all-complete projection", async () => {
        recordSessionBinding("ses_1", "SpecOps", "example");
        // The durable read succeeds until the archive lands, then fails —
        // the active change no longer exists.
        let archived = false;
        const hook = createTodoSyncHook({
            directory: "/project",
            getOpenSpecStatus: async () =>
                archived
                    ? ({ ok: false, error: "Change 'example' not found." } as OpenSpecStatusResult)
                    : complete,
            getApplyInstructions: async () => applyContext(12, "all_done"),
        });

        const beforeArchive = await fireTrigger(hook);
        recordArchivedChange("ses_1");
        archived = true;
        const afterArchive = await fireTrigger(hook);

        // The post-archive durable read fails; the terminal projection is
        // the remembered list finalized at archive time.
        expect(afterArchive).toHaveLength(beforeArchive.length);
        expect(afterArchive.every(todo => todo.status === "completed")).toBe(true);
        expect(afterArchive.find(todo => todo.id === "lifecycle-remediation")?.status).toBe(
            "completed",
        );
    });

    test("a failed archive leaves the active projection untouched", async () => {
        recordSessionBinding("ses_1", "SpecOps", "example");
        const hook = steadyHook();

        await fireTrigger(hook);
        // No archive observation: the wrapper records nothing on failure.
        const afterFailedArchive = byId(await fireTrigger(hook));

        expect(afterFailedArchive.get("lifecycle-remediation")?.status).toBe("pending");
    });

    /** Cross the implementation gate through the real hook seam. */
    function observeGate(): void {
        const hook = steadyHook();
        void hook({ tool: "specops_apply_instructions", sessionID: "ses_1", callID: "gate" }, {
            args: { todos: [] },
        } as never);
    }
});
