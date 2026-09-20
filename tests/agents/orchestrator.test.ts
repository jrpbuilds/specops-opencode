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
        expect(buildOrchestratorPrompt("auto", true).length).toBeLessThan(35_000);
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
        expect(prompt).toContain("specops-review-correctness");
        expect(prompt).toContain("## Specialist evidence");
        expect(prompt).toContain("specops_review_guard");
        expect(prompt).toContain("F1..Fn");
    });

    test("scales review breadth to the change under the auto route", () => {
        const prompt = buildOrchestratorPrompt("interactive", false);

        expect(prompt).toMatch(/scale the review to the change/);
        expect(prompt).toMatch(/light,\s+proportionate pass/);
        expect(prompt).toMatch(
            /runtime or\s+browser checks when the affected behaviour is visual or interactive/,
        );
        expect(prompt).toMatch(/one, two, or all three/);
        expect(prompt).toMatch(/when\s+uncertain between two levels, choose the heavier one/);
    });

    test("passes only dispatched critics in the evidence envelope", () => {
        const prompt = buildOrchestratorPrompt("interactive", false);

        expect(prompt).toMatch(/until every dispatched critic has returned\s+successfully/);
        expect(prompt).toMatch(/one section per dispatched critic and no others/);
        expect(prompt).toMatch(/after every dispatched critic returns and before building/);
    });

    test("keeps re-review on the failed round's route without shrinking the critic set", () => {
        const prompt = buildOrchestratorPrompt("interactive", false);

        expect(prompt).toMatch(/the same\s+route as the review that failed/);
        expect(prompt).toMatch(/the same critic set on the fan-out route,\s+never fewer/);
        expect(prompt).toMatch(
            /scaling up to more critics only when remediation materially grew\s+the change's surface/,
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
