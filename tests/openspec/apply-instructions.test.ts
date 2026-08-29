import { describe, expect, test } from "bun:test";
import type { NormalizedApplyInstructionContext } from "../../src/openspec/apply-instructions.js";
import { applyInstructions } from "../../src/tools/apply-instructions.js";
import { getApplyInstructions } from "../../src/openspec/apply-instructions.js";
import type { CaptureStdout } from "../../src/openspec/helpers.js";

const completeContext: NormalizedApplyInstructionContext = {
    changeName: "example-change",
    changeDir: "/project/openspec/changes/example-change",
    schemaName: "spec-driven",
    contextFiles: {
        proposal: ["/project/openspec/changes/example-change/proposal.md"],
        specs: ["/project/openspec/changes/example-change/specs/example/spec.md"],
        design: ["/project/openspec/changes/example-change/design.md"],
        tasks: ["/project/openspec/changes/example-change/tasks.md"],
    },
    progress: { total: 3, complete: 1, remaining: 2 },
    tasks: [
        { id: "1.1", description: "Implement the wrapper", done: true },
        { id: "1.2", description: "Add the tool", done: false },
    ],
    state: "ready",
    instruction: "Read the canonical context and implement pending tasks.",
    missingArtifacts: [],
    context: "Use the repository conventions.",
    operationGuidance: ["Run focused tests before the full suite."],
    references: [{ id: "proposal", path: "proposal.md" }],
    root: { path: "/project", source: "nearest" },
    warning: "Apply context is advisory to lifecycle safety.",
};

function captureJson(value: unknown, exitCode = 0): CaptureStdout {
    return async () => ({ stdout: JSON.stringify(value), exitCode });
}

describe("getApplyInstructions", () => {
    test("invokes OpenSpec and normalizes the complete canonical context", async () => {
        let invocation: { command: string; args: string[]; cwd?: string } | undefined;
        const capture: CaptureStdout = async (command, args, cwd) => {
            invocation = { command, args, cwd };
            return { stdout: JSON.stringify(completeContext), exitCode: 0 };
        };

        const result = await getApplyInstructions("example-change", "/project", capture);

        expect(invocation).toEqual({
            command: "openspec",
            args: ["instructions", "apply", "--change", "example-change", "--json"],
            cwd: "/project",
        });
        expect(result).toEqual({ ok: true, context: completeContext });
    });

    test("tolerates absent optional fields and root", async () => {
        const {
            missingArtifacts: _missing,
            context: _context,
            operationGuidance: _guidance,
            references: _references,
            root: _root,
            warning: _warning,
            ...required
        } = completeContext;

        const result = await getApplyInstructions(
            "example-change",
            "/project",
            captureJson(required),
        );

        expect(result).toEqual({ ok: true, context: required });
    });

    test("rejects a contextFiles value that is not a string array", async () => {
        const result = await getApplyInstructions(
            "example-change",
            "/project",
            captureJson({ ...completeContext, contextFiles: { proposal: "proposal.md" } }),
        );

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error).toContain("OPENSPEC_MALFORMED_RESPONSE");
            expect(result.error).toContain('field "proposal" expected stringArray');
        }
    });

    test("rejects duplicate task IDs", async () => {
        const result = await getApplyInstructions(
            "example-change",
            "/project",
            captureJson({
                ...completeContext,
                tasks: [
                    { id: "1.1", description: "First task", done: true },
                    { id: "1.1", description: "Second task", done: false },
                ],
            }),
        );

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error).toContain("OPENSPEC_MALFORMED_RESPONSE");
            expect(result.error).toContain('duplicate id "1.1"');
        }
    });

    test("accepts distinct task IDs", async () => {
        const tasks = [
            { id: "1.1", description: "First task", done: true },
            { id: "1.2", description: "Second task", done: false },
        ];
        const result = await getApplyInstructions(
            "example-change",
            "/project",
            captureJson({ ...completeContext, tasks }),
        );

        expect(result).toEqual({ ok: true, context: { ...completeContext, tasks } });
    });

    test.each([
        ["counters that do not sum", { total: 3, complete: 2, remaining: 2 }],
        ["a non-integer counter", { total: 3, complete: 1.5, remaining: 1.5 }],
        ["a negative counter", { total: 3, complete: -1, remaining: 4 }],
    ])("rejects progress with %s", async (_description, progress) => {
        const result = await getApplyInstructions(
            "example-change",
            "/project",
            captureJson({ ...completeContext, progress }),
        );

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toContain("OPENSPEC_MALFORMED_RESPONSE");
    });

    test("accepts internally consistent progress counters", async () => {
        const progress = { total: 3, complete: 1, remaining: 2 };
        const result = await getApplyInstructions(
            "example-change",
            "/project",
            captureJson({ ...completeContext, progress }),
        );

        expect(result).toEqual({ ok: true, context: { ...completeContext, progress } });
    });

    test.each([
        [
            "more done tasks than complete",
            { total: 3, complete: 1, remaining: 2 },
            [
                { id: "1.1", description: "First task", done: true },
                { id: "1.2", description: "Second task", done: true },
            ],
        ],
        [
            "more tasks than total",
            { total: 3, complete: 0, remaining: 3 },
            [
                { id: "1.1", description: "First task", done: false },
                { id: "1.2", description: "Second task", done: false },
                { id: "1.3", description: "Third task", done: false },
                { id: "1.4", description: "Fourth task", done: false },
                { id: "1.5", description: "Fifth task", done: false },
            ],
        ],
    ])("rejects task-list contradiction: %s", async (_description, progress, tasks) => {
        const result = await getApplyInstructions(
            "example-change",
            "/project",
            captureJson({ ...completeContext, progress, tasks }),
        );

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toContain("OPENSPEC_MALFORMED_RESPONSE");
    });

    test("accepts filtered task lists with whole-change counters", async () => {
        const cases = [
            {
                progress: { total: 3, complete: 1, remaining: 2 },
                tasks: [
                    { id: "1.1", description: "First task", done: true },
                    { id: "1.2", description: "Second task", done: false },
                ],
            },
            {
                progress: { total: 4, complete: 3, remaining: 1 },
                tasks: [{ id: "2.1", description: "Resolve remediation", done: false }],
            },
        ];

        for (const input of cases) {
            const result = await getApplyInstructions(
                "example-change",
                "/project",
                captureJson({ ...completeContext, ...input }),
            );
            expect(result).toEqual({ ok: true, context: { ...completeContext, ...input } });
        }
    });

    test("reports a capture failure", async () => {
        const result = await getApplyInstructions("example-change", "/project", async () => {
            throw new Error("spawn openspec ENOENT");
        });

        expect(result).toEqual({
            ok: false,
            error: "Unable to run OpenSpec instructions apply: spawn openspec ENOENT",
        });
    });

    test("reports a terminated process", async () => {
        const result = await getApplyInstructions("example-change", "/project", async () => ({
            stdout: "",
            exitCode: null,
        }));

        expect(result).toEqual({
            ok: false,
            error: "OpenSpec instructions apply was terminated before returning a result",
        });
    });

    test("reports invalid JSON including stdout", async () => {
        const result = await getApplyInstructions("example-change", "/project", async () => ({
            stdout: "not json",
            exitCode: 0,
        }));

        expect(result).toEqual({
            ok: false,
            error: "OpenSpec instructions apply returned invalid JSON: not json",
        });
    });

    test("reports a structured non-zero command failure", async () => {
        const result = await getApplyInstructions(
            "example-change",
            "/project",
            captureJson({ status: [{ message: "Cannot apply", fix: "Finish planning" }] }, 1),
        );

        expect(result).toEqual({
            ok: false,
            error: "Cannot apply Fix: Finish planning",
        });
    });

    test("uses the exit-code fallback for a non-zero record without status", async () => {
        const result = await getApplyInstructions("example-change", "/project", captureJson({}, 2));

        expect(result).toEqual({
            ok: false,
            error: "OpenSpec instructions apply failed with exit code 2",
        });
    });

    test.each(["[]", JSON.stringify("unexpected"), "null"])(
        "rejects a non-record non-zero response %s",
        async stdout => {
            const result = await getApplyInstructions("example-change", "/project", async () => ({
                stdout,
                exitCode: 1,
            }));

            expect(result).toEqual({
                ok: false,
                error: "OpenSpec instructions apply returned an invalid result",
            });
        },
    );

    test("reports a missing required field without a partial result", async () => {
        const { instruction: _instruction, ...missingInstruction } = completeContext;
        const result = await getApplyInstructions(
            "example-change",
            "/project",
            captureJson(missingInstruction),
        );

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toContain("OPENSPEC_MALFORMED_RESPONSE");
    });

    test("refreshes on every call instead of caching remediation context", async () => {
        const refreshedContext = {
            ...completeContext,
            contextFiles: { ...completeContext.contextFiles, tasks: ["/project/tasks-v2.md"] },
            progress: { total: 4, complete: 3, remaining: 1 },
            tasks: [{ id: "2.1", description: "Resolve remediation", done: false }],
        };
        const responses = [completeContext, refreshedContext];
        const capture: CaptureStdout = async () => ({
            stdout: JSON.stringify(responses.shift()),
            exitCode: 0,
        });

        const first = await getApplyInstructions("example-change", "/project", capture);
        const second = await getApplyInstructions("example-change", "/project", capture);

        expect(first).toEqual({ ok: true, context: completeContext });
        expect(second).toEqual({ ok: true, context: refreshedContext });
    });

    test("serializes one canonical context identically for every review handoff", async () => {
        const result = await getApplyInstructions(
            "example-change",
            "/project",
            captureJson(completeContext),
        );
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const deps = { getApplyInstructions: async () => result };
        const handoffs = await Promise.all([
            applyInstructions("example-change", deps),
            applyInstructions("example-change", deps),
            applyInstructions("example-change", deps),
            applyInstructions("example-change", deps),
            applyInstructions("example-change", deps),
        ]);

        expect(new Set(handoffs).size).toBe(1);
        expect(handoffs[0]).toBe(JSON.stringify(completeContext, null, 2));
    });
});
