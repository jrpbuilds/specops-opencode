import { afterEach, describe, expect, test } from "bun:test";
import {
    recordReviewDispatch,
    recordReviewResult,
    observeImplementationGate,
} from "../../src/host/review-cycle.js";
import {
    __resetSessionBindingsForTesting,
    getRememberedTodoProjection,
    getReviewCycle,
    hasEnteredImplementation,
    recordArchivedChange,
    recordReviewCycle,
    recordSessionBinding,
    rememberTodoProjection,
} from "../../src/host/session-bindings.js";

/**
 * Runtime observation of the review cycle: verdict parsing from reviewer
 * results, round transitions from review-role dispatches, and the
 * gate-crossing supersession rule.
 */

/** Fire the before-hook seam for one task dispatch. */
function dispatch(subagentType: string, sessionID = "ses_1"): Promise<void> {
    return recordReviewDispatch(
        { tool: "task", sessionID, callID: "call_d" },
        { args: { subagent_type: subagentType } },
    );
}

/** Fire the after-hook seam for one task result. */
function result(subagentType: string, output: string, sessionID = "ses_1"): Promise<void> {
    return recordReviewResult(
        { tool: "task", sessionID, callID: "call_r", args: { subagent_type: subagentType } },
        { title: "", output, metadata: {} },
    );
}

afterEach(() => {
    __resetSessionBindingsForTesting();
});

describe("recordReviewResult", () => {
    test("records a PASS verdict and concludes the cycle", async () => {
        recordSessionBinding("ses_1", "SpecOps", "example");

        await result("specops-reviewer", "PASS\nCompliance matrix:\n- R1 — VERIFIED");

        expect(getReviewCycle("ses_1")).toEqual({ verdict: "pass" });
    });

    test("records a FAIL verdict and opens the remediation round", async () => {
        recordSessionBinding("ses_1", "SpecOps", "example");

        await result("specops-reviewer", "FAIL\nF1 — broken");

        expect(getReviewCycle("ses_1")).toEqual({ verdict: "fail", round: "remediation" });
    });

    test("leaves state unchanged for unresolved outputs", async () => {
        recordSessionBinding("ses_1", "SpecOps", "example");

        await result("specops-reviewer", "FRONTIER ELIGIBLE BLOCKER\n<ambiguity>");
        expect(getReviewCycle("ses_1")).toBeUndefined();

        await result("specops-reviewer", "");
        expect(getReviewCycle("ses_1")).toBeUndefined();
    });

    test("ignores non-reviewer and unbound-session results", async () => {
        recordSessionBinding("ses_1", "SpecOps", "example");

        await result("specops-implementer", "PASS\nwork done", "ses_1");
        expect(getReviewCycle("ses_1")).toBeUndefined();

        await result("specops-reviewer", "PASS\nunbound", "ses_other");
        expect(getReviewCycle("ses_other")).toBeUndefined();
    });

    test("a later verdict replaces the earlier one", async () => {
        recordSessionBinding("ses_1", "SpecOps", "example");

        await result("specops-reviewer", "FAIL\nF1");
        await result("specops-reviewer", "PASS\nfixed");

        expect(getReviewCycle("ses_1")).toEqual({ verdict: "pass" });
    });
});

describe("recordReviewDispatch", () => {
    test("a review-role dispatch during a FAIL cycle begins the re-review round", async () => {
        recordSessionBinding("ses_1", "SpecOps", "example");
        await result("specops-reviewer", "FAIL\nF1");

        await dispatch("specops-review-correctness");
        expect(getReviewCycle("ses_1")).toEqual({ verdict: "fail", round: "re-review" });

        // A further review dispatch inside the re-review round is a no-op.
        await dispatch("specops-reviewer");
        expect(getReviewCycle("ses_1")).toEqual({ verdict: "fail", round: "re-review" });
    });

    test("dispatches outside an active FAIL cycle never open a round", async () => {
        recordSessionBinding("ses_1", "SpecOps", "example");

        await dispatch("specops-review-correctness");
        expect(getReviewCycle("ses_1")).toBeUndefined();

        await result("specops-reviewer", "PASS\nok");
        await dispatch("specops-reviewer");
        expect(getReviewCycle("ses_1")).toEqual({ verdict: "pass" });
    });

    test("non-review dispatches never change the round", async () => {
        recordSessionBinding("ses_1", "SpecOps", "example");
        await result("specops-reviewer", "FAIL\nF1");

        await dispatch("specops-implementer");
        await dispatch("specops-planner");

        expect(getReviewCycle("ses_1")).toEqual({ verdict: "fail", round: "remediation" });
    });
});

describe("observeImplementationGate", () => {
    test("marks the gate and supersedes a concluded verdict", () => {
        recordSessionBinding("ses_1", "SpecOps", "example");
        recordReviewCycle("ses_1", { verdict: "pass" });

        observeImplementationGate("ses_1");

        expect(hasEnteredImplementation("ses_1")).toBe(true);
        expect(getReviewCycle("ses_1")).toBeUndefined();
    });

    test("keeps an active FAIL cycle across the gate", async () => {
        recordSessionBinding("ses_1", "SpecOps", "example");
        await result("specops-reviewer", "FAIL\nF1");

        observeImplementationGate("ses_1");

        expect(getReviewCycle("ses_1")).toEqual({ verdict: "fail", round: "remediation" });
    });

    test("binding switch to another change clears the cycle and finalized projection", () => {
        recordSessionBinding("ses_1", "SpecOps", "example");
        recordReviewCycle("ses_1", { verdict: "fail", round: "remediation" });
        rememberTodoProjection("ses_1", [
            {
                id: "implementation",
                content: "Implementation",
                status: "in_progress",
                priority: "medium",
            },
        ]);
        recordArchivedChange("ses_1");
        expect(
            getRememberedTodoProjection("ses_1")?.every(todo => todo.status === "completed"),
        ).toBe(true);

        recordSessionBinding("ses_1", "SpecOps", "next-change");

        expect(getReviewCycle("ses_1")).toBeUndefined();
        expect(getRememberedTodoProjection("ses_1")).toBeUndefined();
    });
});
