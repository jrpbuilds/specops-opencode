import type { Config } from "@opencode-ai/plugin";
import { describe, expect, test } from "bun:test";
import { AGENT_IDS } from "../../src/agents/ids.js";
import {
    buildOrchestratorPrompt,
    SPECOPS_AGENT_ID,
    SPECOPS_AUTO_AGENT_ID,
} from "../../src/agents/orchestrator.js";
import { registerAutoOrchestratorAgent, registerOrchestratorAgent } from "../../src/host/agents.js";
import {
    ORCHESTRATOR_PERMISSION,
    SPECOPS_LIFECYCLE_PERMISSION,
    SPECOPS_TASK_ALLOW,
} from "../../src/agents/permissions.js";
import {
    DEFAULT_AUTO_REVIEW_ITERATIONS,
    DEFAULT_IMPLEMENTER_FANOUT,
    DEFAULT_REVIEW_FANOUT,
    DEFAULT_SUBAGENT_CONCURRENCY,
    type SpecOpsConfig,
} from "../../src/config.js";

function makeConfig(
    overrides: Partial<SpecOpsConfig["agents"]> = {},
    frontierEscalation = false,
): SpecOpsConfig {
    const defaults = Object.fromEntries(
        Object.values(AGENT_IDS).map(id => [id, {}]),
    ) as SpecOpsConfig["agents"];
    return {
        agents: { ...defaults, ...overrides } as SpecOpsConfig["agents"],
        frontierEscalation,
        maxSubagentConcurrency: DEFAULT_SUBAGENT_CONCURRENCY,
        maxAutoReviewIterations: DEFAULT_AUTO_REVIEW_ITERATIONS,
        implementerFanout: DEFAULT_IMPLEMENTER_FANOUT,
        reviewFanout: DEFAULT_REVIEW_FANOUT,
    };
}

function promptOf(config: Config, id: string): string {
    return config.agent?.[id]?.prompt as string;
}

function evaluateTask(task: Record<string, "allow" | "deny">, name: string): "allow" | "deny" {
    let action: "allow" | "deny" | undefined;
    for (const [pattern, effect] of Object.entries(task)) {
        const matches =
            pattern === "*" ||
            (pattern.endsWith("*") && name.startsWith(pattern.slice(0, -1))) ||
            pattern === name;
        if (matches) action = effect;
    }
    return action ?? "deny";
}

describe("orchestrator prompt contract", () => {
    test("keeps interactive and auto mode policies mutually exclusive", () => {
        const interactive = buildOrchestratorPrompt("interactive", false);
        const auto = buildOrchestratorPrompt("auto", false);

        expect(interactive).toContain("## Interactive policy");
        expect(interactive).not.toContain("## Autonomous operation (SpecOps Auto)");
        expect(interactive).not.toContain("## Autonomous plan continuation");
        expect(auto).toContain("## Autonomous operation (SpecOps Auto)");
        expect(auto).toContain("## Autonomous plan continuation");
        expect(auto).not.toContain("## Interactive policy");
    });

    test("pins the assembled orchestrator identity header", () => {
        expect(buildOrchestratorPrompt("interactive", false)).toContain("# SpecOps Orchestrator");
        expect(buildOrchestratorPrompt("auto", false)).toContain("# SpecOps Orchestrator");
    });

    test("keeps assembled prompts substantially below the legacy budget", () => {
        expect(buildOrchestratorPrompt("auto", true).length).toBeLessThan(35_500);
    });

    test("consumes canonical status legality without reconstructing scheduler state", () => {
        const prompt = buildOrchestratorPrompt("interactive", false);

        expect(prompt).toContain("phase`, `lifecycle`, and `eligibleActions");
        expect(prompt).toContain("an allowed action is legal, not recommended");
        expect(prompt).toContain("An `author-artifact` action names the exact artifact id");
        expect(prompt).toContain("legal actions using engineering judgement");
        expect(prompt).not.toContain("reverse-dependency reachability");
        expect(prompt).not.toContain("createRollingScheduler");
        expect(prompt).not.toContain("specops_progress");
        expect(prompt).not.toContain("lane-continuation ledger");
    });

    test("keeps startup, Todo trigger, and runtime-ownership boundaries", () => {
        const prompt = buildOrchestratorPrompt("interactive", false);

        expect(prompt).toContain("Call `specops_onboard` first");
        expect(prompt).toContain("Call `specops_context` exactly once");
        expect(prompt).toContain("Establish exactly one current change");
        expect(prompt).toContain(
            'SPECOPS_TODO_REFRESH: call todowrite with {"todos":[]} now — one refresh per assistant turn.',
        );
        expect(prompt).toContain("Never author,");
        expect(prompt).toContain("route from Todo content");
    });

    test("preserves Orchestrator judgement for implementation and review", () => {
        const prompt = buildOrchestratorPrompt("interactive", false);

        expect(prompt).toContain("Serial implementation is the default");
        expect(prompt).toContain("Parallel implementation is a judgement call");
        expect(prompt).toContain("independence alone is insufficient");
        expect(prompt).toContain("maxSubagentConcurrency");
        expect(prompt).toContain("assignedTaskIds: <id>, <id>");
        expect(prompt).toContain("dispatch boundary validates identity, capacity, overlap");
        expect(prompt).toContain("never ask the runtime to regroup or repartition it");
        expect(prompt).toContain("reviewFanout");
        expect(prompt).toContain("### C1 — correctness — frontend");
        expect(prompt).toContain("## Specialist evidence");
        expect(prompt).toContain("specops_review_guard");
        expect(prompt).toContain("F1..Fn");
    });

    test("carries advisory capability authorship and prose-only envelope rules in both modes", () => {
        for (const mode of ["interactive", "auto"] as const) {
            const prompt = buildOrchestratorPrompt(mode, false);

            expect(prompt).toContain(
                "Any specialist dispatch may carry a short advisory capability hint",
            );
            expect(prompt).toContain(
                "Orchestrator-authored prose naming the packaged or project/user skills judged relevant",
            );
            expect(prompt).toContain(
                "A hint never changes which specialists are dispatched, so lane selection, critic selection, and review breadth stay with their existing contracts",
            );
            expect(prompt).toContain(
                "A dispatch may also carry one short advisory capability-hint note",
            );
            expect(prompt).toContain("never tool output and never a field");
            expect(prompt).toContain(
                "never begin a line with the validated `changeName:` or `assignedTaskIds:` tokens",
            );
        }
    });

    test("describes direct, focused, full, and expanded plans in both modes", () => {
        for (const mode of ["interactive", "auto"] as const) {
            const prompt = buildOrchestratorPrompt(mode, false);
            const review = prompt
                .split("## Review phase")[1]
                ?.split("## Schema-aware remediation")[0];

            expect(review).toMatch(/\*\*Direct:\*\* only `specops-reviewer`.*isolated, low-risk/s);
            expect(review).toMatch(/\*\*Focused:\*\* one or two scoped specialist lanes/s);
            expect(review).toMatch(
                /\*\*Full gauntlet:\*\* at least one correctness, risk, and quality lane/s,
            );
            expect(review).toMatch(/\*\*Expanded:\*\* more than three specialist lanes/s);
            expect(review).toMatch(
                /Multiple lanes sharing a lens need materially different scopes/,
            );
            expect(review).toMatch(/visual or interactive behaviour in a runtime or browser/);
        }
    });

    test("applies fan-out settings without turning concurrency or skills into review targets", () => {
        const prompt = buildOrchestratorPrompt("auto", false);
        const review = prompt.split("## Review phase")[1]?.split("## Schema-aware remediation")[0];

        expect(review).toMatch(/`reviewFanout: never` requires direct review/);
        expect(review).toMatch(/`auto` allows all four shapes/);
        expect(review).toMatch(
            /`always` requires at least one correctness, risk, and quality lane/,
        );
        expect(review).toMatch(/do not load every skill or fill free concurrency slots/);
        expect(review).toMatch(
            /`maxSubagentConcurrency` is an in-flight ceiling, not a plan-size target/,
        );
        expect(review).toMatch(/skills never choose scope or lens/);
        expect(review).toMatch(
            /Reviewer remains the sole owner of the compliance matrix and PASS\/FAIL/,
        );
    });

    test("grounds scenario choices in qualitative evidence and distinct scopes", () => {
        const prompt = buildOrchestratorPrompt("interactive", false);
        const review = prompt.split("## Review phase")[1]?.split("## Schema-aware remediation")[0];

        expect(review).toMatch(/specialists add ceremony, not evidence/);
        expect(review).toMatch(/UI correctness or a security-sensitive backend boundary/);
        expect(review).toMatch(/substantial scope or elevated risk merits all three lenses/);
        expect(review).toMatch(/frontend and backend correctness plus security and database risk/);
        expect(review).toMatch(/verification quality and coverage, and prior remediation evidence/);
        expect(review).toMatch(/Avoid file-count or task-count thresholds and scoring formulas/);
        expect(review).toMatch(/Do not split coherent concerns for parallelism/);
        expect(review).toMatch(/Multiple lanes sharing a lens need materially different scopes/);
        expect(review).toMatch(/register the selected plan with `specops_review_lanes` start/);
    });

    test("passes every completed lane's report in deterministic order, including same-lens lanes", () => {
        for (const mode of ["interactive", "auto"] as const) {
            const prompt = buildOrchestratorPrompt(mode, false);
            const review = prompt
                .split("## Review phase")[1]
                ?.split("## Schema-aware remediation")[0];

            expect(review).toMatch(/Dispatch the Reviewer only at\s+`fanInComplete: true`/);
            expect(review).toContain("every completed lane's report verbatim");
            expect(review).toContain("one section per lane and no others");
            expect(review).toContain("registered lane id, lens, and scope");
            expect(review).toContain("then by registration order within each lens");
            expect(review).toContain("not by completion order");
            expect(review).toContain("Omit the whole envelope on the direct route");
            expect(review).toMatch(
                /### C1 — correctness — frontend[\s\S]*### C2 — correctness — backend[\s\S]*### R1 — risk — security[\s\S]*### Q1 — quality — integration/,
            );
            expect(review).not.toContain("### specops-review-correctness");
            expect(review).toContain("verify after each critic result and after the Reviewer");
        }
    });

    test("recomposes proportionate re-review coverage in both modes", () => {
        for (const mode of ["interactive", "auto"] as const) {
            const prompt = buildOrchestratorPrompt(mode, false);

            expect(prompt).toContain("reset the prior review round");
            expect(prompt).toContain("Choose a fresh proportionate plan");
            expect(prompt).toContain("direct, focused, full, or expanded under `reviewFanout`");
            expect(prompt).toContain("remediation changes, outstanding canonical findings");
            expect(prompt).toContain("Prior lanes inform coverage, not assignments");
            expect(prompt).toContain("retain, reshape, add, or drop scoped lanes");
            expect(prompt).toContain("capability hints as surfaces change");
            expect(prompt).toContain("Never drop coverage to evade independent verification");
            expect(prompt).not.toContain("never fewer");
            expect(prompt).not.toContain("same route as the review that failed");
        }
    });

    test("keeps canonical findings and full Final Reviewer verification across review plans", () => {
        for (const mode of ["interactive", "auto"] as const) {
            const prompt = buildOrchestratorPrompt(mode, false);

            expect(prompt).toContain("finding `F1..Fn` and correction target verbatim");
            expect(prompt).toContain(
                "Lane and candidate IDs are round-scoped evidence, not canonical findings",
            );
            expect(prompt).toContain(
                "new reports (if any), the remediation summary, prior findings verbatim",
            );
            expect(prompt).toContain("independently rechecks every prior finding");
            expect(prompt).toContain(
                "the complete approved change, regressions, and new material approved-scope defects",
            );
        }
        expect(buildOrchestratorPrompt("auto", false)).toContain(
            "Each remediation/re-review round consumes one",
        );
    });

    test("retains the archive boundary that tooling cannot prove", () => {
        const prompt = buildOrchestratorPrompt("interactive", false);

        expect(prompt).toContain("does not list archive as an eligible action");
        expect(prompt).toContain("review PASS is not durable");
        expect(prompt).toMatch(/archived only after the required\s+review succeeds/);
        expect(prompt).toContain("Archive despite findings");
        expect(prompt).toContain("specops_archive_instructions");
        expect(prompt).toContain("Never archive from the sync flow");
    });

    test("keeps durable handoff, blocker, and update boundaries", () => {
        const prompt = buildOrchestratorPrompt("interactive", false);

        expect(prompt).toContain("## Handoff gate");
        expect(prompt).toContain("Read fresh `specops_status`");
        expect(prompt).toContain("### Malformed or missing handoff return");
        expect(prompt).toContain("Do not retry again or create a fresh session");
        expect(prompt).toContain("Never resolve a blocker by taking over specialist-owned work");
        expect(prompt).toContain("## Update flow");
    });

    test("places settled verification before review and preserves the shared handoff", () => {
        for (const mode of ["interactive", "auto"] as const) {
            const prompt = buildOrchestratorPrompt(mode, false);
            expect(prompt).toContain("Settled integrated verification");
            expect(prompt.indexOf("Settled integrated verification")).toBeLessThan(
                prompt.indexOf("## Review phase"),
            );
            expect(prompt).toContain("## Delegation contract");
        }
    });

    test("returns misplaced decision recommendations for correction in both modes", () => {
        for (const mode of ["interactive", "auto"] as const) {
            const prompt = buildOrchestratorPrompt(mode, false);
            expect(prompt).toContain("does not identify the first supplied option");
        }
        expect(buildOrchestratorPrompt("interactive", false)).toMatch(
            /append\s+` \(Recommended\)` to the first supplied option only/,
        );
    });
});

describe("interactive orchestrator contract", () => {
    const prompt = buildOrchestratorPrompt("interactive", false);

    test("requires explicit plan approval and preserves exact lifecycle choices", () => {
        expect(prompt).toContain("## Plan checkpoint");
        expect(prompt).toContain("header: `Plan ready`");
        expect(prompt).toContain("sole option: `Start implementation`");
        expect(prompt).toContain("revision invalidates approval");
        expect(prompt).toContain("## Review lifecycle checkpoint");
        expect(prompt).toContain("`Complete and archive`");
        expect(prompt).toContain("`Address findings`");
        expect(prompt).toContain("`Archive despite findings`");
        expect(prompt).toContain("`Leave open`");
    });

    test("routes material decisions and remediation without inventing policy", () => {
        expect(prompt).toContain("Only Planner and Designer may return");
        expect(prompt).toContain("preserve the 2-4 options and their order");
        expect(prompt).toContain("same specialist");
        expect(prompt).toContain("same pass and same artifact");
        expect(prompt).toContain("schema-aware remediation");
        expect(prompt).toMatch(/Never auto-remediate\s+in interactive mode/);
    });
});

describe("Auto orchestrator contract", () => {
    const prompt = buildOrchestratorPrompt("auto", false);

    test("has no human checkpoints and continues from legal status", () => {
        expect(prompt).toContain("Never invoke the native");
        expect(prompt).toContain("## Autonomous plan continuation");
        expect(prompt).toContain("makes `enter-implementation` legal");
        expect(prompt).not.toContain("## Plan checkpoint");
        expect(prompt).not.toContain("Review passed");
    });

    test("uses a finite review-remediation budget and terminal result", () => {
        expect(prompt).toContain("Read `maxAutoReviewIterations` from `specops_config`");
        expect(prompt).toContain("configured finite budget");
        expect(prompt).toContain("FAIL remains when the budget is exhausted");
        expect(prompt).toContain("`COMPLETED`");
        expect(prompt).toContain("`BLOCKED`");
        expect(prompt).not.toContain("{{maxAutoReviewIterations}}");
    });
});

describe("orchestrator registration", () => {
    test("registers both modes with the assembled prompts and hard question boundary", () => {
        const interactiveConfig: Config = {};
        const autoConfig: Config = {};
        registerOrchestratorAgent(interactiveConfig, makeConfig());
        registerAutoOrchestratorAgent(autoConfig, makeConfig());

        expect(promptOf(interactiveConfig, SPECOPS_AGENT_ID)).toBe(
            buildOrchestratorPrompt("interactive", false),
        );
        expect(promptOf(autoConfig, SPECOPS_AUTO_AGENT_ID)).toBe(
            buildOrchestratorPrompt("auto", false),
        );

        const interactivePermission = interactiveConfig.agent?.[SPECOPS_AGENT_ID]
            ?.permission as Record<string, unknown>;
        const autoPermission = autoConfig.agent?.[SPECOPS_AUTO_AGENT_ID]?.permission as Record<
            string,
            unknown
        >;

        expect(interactivePermission.question).toBe("allow");
        expect(autoPermission.question).toBe("deny");
        expect(interactivePermission.external_directory).toBe("deny");
        expect(autoPermission.external_directory).toBe("deny");
        expect(interactivePermission.doom_loop).toBeUndefined();
        expect(autoPermission.doom_loop).toBe("deny");
        expect(interactivePermission.bash).toEqual({
            "*": "deny",
            "openspec --help": "allow",
            "openspec * --help": "allow",
            "openspec list *": "allow",
            "openspec instructions *": "allow",
            "openspec validate *": "allow",
            "openspec change show *": "allow",
        });
        expect(autoPermission.bash).toEqual(interactivePermission.bash);
        expect(interactivePermission[SPECOPS_LIFECYCLE_PERMISSION]).toBe("allow");
        expect(autoPermission[SPECOPS_LIFECYCLE_PERMISSION]).toBe("allow");
    });

    test("does not bake the configured Auto review budget into the prompt", () => {
        const specOpsConfig = makeConfig();
        specOpsConfig.maxAutoReviewIterations = 12;
        const config: Config = {};

        registerAutoOrchestratorAgent(config, specOpsConfig);

        const prompt = promptOf(config, SPECOPS_AUTO_AGENT_ID);
        expect(prompt).toBe(buildOrchestratorPrompt("auto", false));
        expect(prompt).not.toContain("12 remediation rounds");
        expect(prompt).not.toContain("{{maxAutoReviewIterations}}");
        expect(prompt).toContain("Read `maxAutoReviewIterations` from `specops_config`");
    });

    test("restricts orchestrators to the private SpecOps subagent namespace", () => {
        const configs: Config[] = [{}, {}];
        registerOrchestratorAgent(configs[0], makeConfig());
        registerAutoOrchestratorAgent(configs[1], makeConfig());
        const names = [
            "general",
            "explore",
            "custom-non-specops",
            "specops-explorer",
            "specops-planner",
            "specops-designer",
            "specops-implementer",
            "specops-reviewer",
            "specops-frontier",
        ];

        for (const [index, config] of configs.entries()) {
            const id = index === 0 ? SPECOPS_AGENT_ID : SPECOPS_AUTO_AGENT_ID;
            const permission = config.agent?.[id]?.permission as {
                task: Record<string, "allow" | "deny">;
            };
            expect(permission.task).toEqual(SPECOPS_TASK_ALLOW);
            expect(Object.keys(permission.task)).toEqual(["*", "specops-*"]);
            for (const name of names) {
                expect(evaluateTask(permission.task, name)).toBe(
                    name.startsWith("specops-") ? "allow" : "deny",
                );
            }
        }
    });

    test("keeps capability policy and Frontier loading aligned across modes", () => {
        const interactive: Config = {};
        const auto: Config = {};
        registerOrchestratorAgent(interactive, makeConfig());
        registerAutoOrchestratorAgent(auto, makeConfig());

        expect(interactive.agent?.[SPECOPS_AGENT_ID]?.permission).toMatchObject(
            ORCHESTRATOR_PERMISSION,
        );
        expect(auto.agent?.[SPECOPS_AUTO_AGENT_ID]?.permission).toMatchObject(
            ORCHESTRATOR_PERMISSION,
        );

        const disabled: Config = {};
        const enabled: Config = {};
        registerOrchestratorAgent(disabled, makeConfig({}, false));
        registerOrchestratorAgent(enabled, makeConfig({}, true));
        expect(promptOf(disabled, SPECOPS_AGENT_ID)).not.toContain(
            "Frontier escalation is enabled for this session",
        );
        expect(promptOf(enabled, SPECOPS_AGENT_ID)).toContain(
            "Frontier escalation is enabled for this session",
        );
    });

    test("applies configured orchestrator models without changing fallback semantics", () => {
        const config: Config = {};
        registerOrchestratorAgent(
            config,
            makeConfig({
                [AGENT_IDS.orchestrator]: {
                    model: "opencode-go/deepseek-v4-flash",
                    variant: "high",
                },
            }),
        );
        expect(config.agent?.[SPECOPS_AGENT_ID]).toMatchObject({
            model: "opencode-go/deepseek-v4-flash",
            variant: "high",
        });

        const fallback: Config = {};
        registerOrchestratorAgent(
            fallback,
            makeConfig({ [AGENT_IDS.orchestrator]: { model: "   ", variant: "high" } }),
        );
        expect("model" in (fallback.agent?.[SPECOPS_AGENT_ID] ?? {})).toBe(false);
        expect("variant" in (fallback.agent?.[SPECOPS_AGENT_ID] ?? {})).toBe(false);
    });
});
