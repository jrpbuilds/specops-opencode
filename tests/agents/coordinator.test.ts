import type { Config } from "@opencode-ai/plugin";
import { describe, expect, test } from "bun:test";
import { AGENT_IDS } from "../../src/agents/ids.js";
import {
    buildCoordinatorPrompt,
    registerAutoCoordinatorAgent,
    registerCoordinatorAgent,
    SPECOPS_AGENT_ID,
    SPECOPS_AUTO_AGENT_ID,
} from "../../src/agents/coordinator.js";
import {
    COORDINATOR_PERMISSION,
    SPECOPS_LIFECYCLE_PERMISSION,
    SPECOPS_TASK_ALLOW,
} from "../../src/agents/permissions.js";
import type { SpecOpsConfig } from "../../src/config.js";

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
    };
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

function promptOf(config: Config, id: string): string {
    return config.agent?.[id]?.prompt as string;
}

describe("coordinator prompt composition", () => {
    test("interactive and Auto receive mutually exclusive mode policies", () => {
        const interactive = buildCoordinatorPrompt("interactive", false);
        const auto = buildCoordinatorPrompt("auto", false);

        expect(interactive).toContain("# SpecOps Coordinator");
        expect(interactive).toContain("## Interactive policy");
        expect(interactive).not.toContain("## Autonomous operation (SpecOps Auto)");

        expect(auto).toContain("# SpecOps Coordinator");
        expect(auto).toContain("## Autonomous operation (SpecOps Auto)");
        expect(auto).not.toContain("## Interactive policy");
        expect(auto).not.toContain("overrides the human-checkpoint clauses above");
    });

    test("Frontier policy is loaded only when enabled", () => {
        for (const mode of ["interactive", "auto"] as const) {
            const disabled = buildCoordinatorPrompt(mode, false);
            const enabled = buildCoordinatorPrompt(mode, true);

            expect(disabled).not.toContain("Frontier escalation is enabled for this session");
            expect(enabled).toContain("## Frontier escalation");
            expect(enabled).toContain("Frontier escalation is enabled for this session");
            expect(enabled).toContain(
                "Each distinct blocker gets at most one Frontier consultation",
            );
        }
    });

    test("assembled prompts stay within regression budgets", () => {
        expect(buildCoordinatorPrompt("interactive", false).length).toBeLessThan(17_700);
        expect(buildCoordinatorPrompt("auto", false).length).toBeLessThan(14_700);
        expect(buildCoordinatorPrompt("interactive", true).length).toBeLessThan(19_000);
        expect(buildCoordinatorPrompt("auto", true).length).toBeLessThan(15_700);
    });
});

describe("shared coordinator contract", () => {
    const prompt = buildCoordinatorPrompt("interactive", false);

    test("keeps deterministic startup and resume/create ownership", () => {
        expect(prompt).toContain("Call `specops_onboard` first");
        expect(prompt).toContain("Call `specops_context` exactly once");
        expect(prompt).toContain(
            "Establish exactly one current change before any specialist delegation",
        );
        expect(prompt).toContain("resume it. Do not create a duplicate");
        expect(prompt).toContain("If `activeChanges` is empty");
        expect(prompt).toContain("call `specops_create_change` once");
        expect(prompt).toContain("Do not crawl `openspec/`");
        expect(prompt).toContain("deprecated `openspec change list`");
    });

    test("routes planning from the artifact graph and preserves apply/review phases", () => {
        const expected = [
            "## Routing from the OpenSpec artifact graph",
            "`specops_status`",
            "`applyRequires` closure",
            "reverse-dependency reachability",
            "design → specops-designer",
            "`specops-designer`",
            "other → specops-planner",
            "mode-specific plan policy",
            "`specops-implementer`",
            "`specops-reviewer`",
            "mode-specific lifecycle policy",
        ];
        for (const marker of expected) expect(prompt).toContain(marker);

        expect(prompt).toContain("run `specops-explorer`");
        expect(prompt).toContain("Startup: read `specops_status`");
        expect(prompt).toContain("greenfield, small, single-file");
        expect(prompt).toContain(
            "never skips exploration, planning, or apply-readiness (and, after apply, independent review)",
        );
    });

    test("keeps specialist ownership explicit without duplicating specialist procedures", () => {
        expect(prompt).toContain("`specops-explorer` — repository evidence");
        expect(prompt).toContain(
            "`specops-planner` — requirements and task-planning artifacts as declared by the change's schema",
        );
        expect(prompt).toContain(
            "`specops-designer` — technical design artifact(s) as declared by the schema",
        );
        expect(prompt).toContain("`specops-implementer` — source/tests");
        expect(prompt).toContain("`specops-reviewer` — independent verification");
        expect(prompt).toContain("Coordinate; do not perform specialist work yourself");
    });

    test("defines one delegation contract and scoped Project Context", () => {
        expect(prompt).toContain("## Delegation contract");
        expect(prompt).toContain("user's original goal");
        expect(prompt).toContain("current OpenSpec change name");
        expect(prompt).toContain("relevant scoped Project Context");
        expect(prompt).toContain("Do not assume specialists share your working context");

        expect(prompt).toContain("## Project Context");
        expect(prompt).toContain("Retain one current capsule in working context for this run only");
        expect(prompt).toContain("do not persist it");
        expect(prompt).toContain("orientation, not authority");
    });

    test("uses the shared Engram policy", () => {
        expect(prompt).toContain("## Engram");
        expect(prompt).toContain("Use Engram as contextual memory, not authority");
        expect(prompt).toContain("Engram is optional");
        expect(prompt).toContain("must not block your pass");
    });

    test("establishes a change before any specialist delegation", () => {
        expect(prompt).toContain(
            "Establish exactly one current change before any specialist delegation",
        );
        expect(prompt).toContain("If `activeChanges` is empty");
        expect(prompt).toContain("call `specops_create_change` once");
        expect(prompt).toContain(
            "Only a successful creation (or a resumed change) permits specialist delegation",
        );
        expect(prompt).toContain("If creation fails, stop as BLOCKED");
        expect(prompt).toContain("Do not delegate to any specialist");
    });

    test("requires every delegation to carry the current change name", () => {
        expect(prompt).toContain(
            "Every specialist delegation must explicitly carry the current change name",
        );
        expect(prompt).toContain("Do not dispatch any specialist until a current change exists");
    });

    test("recovers a malformed completed Task return via task_id once", () => {
        const malformed = prompt.slice(prompt.indexOf("### Malformed or missing handoff return"));
        expect(malformed).toContain("Resume the same OpenCode Task session");
        expect(malformed).toContain("task_id");
        expect(malformed).toContain("return its already-completed handoff");
        expect(malformed).toContain("without repeating any investigation or owned work");
        expect(malformed).toContain("Do not retry a second time");
        expect(malformed).toContain("do not spawn a fresh session");
        expect(malformed).toContain("A genuine execution error");
        expect(malformed).toContain("is not a malformed return");
        expect(malformed).not.toContain("launch a fresh specialist investigation");
    });

    test("gates every handoff against durable state", () => {
        expect(prompt).toContain("## Handoff gate");
        expect(prompt).toContain("After every specialist return and before routing onward");
        expect(prompt).toContain("Read fresh `specops_status`");
        expect(prompt).toContain("dispatched artifact's reported status transition");
        expect(prompt).toContain("Route from durable OpenSpec state");
        expect(prompt).toContain("not from `NEXT` or a claimed success alone");
        expect(prompt).toContain(
            "`specops_status` (the OpenSpec artifact graph) and task checkbox state",
        );
    });

    test("routes blockers by ownership rather than taking work over", () => {
        expect(prompt).toContain("missing repository evidence");
        expect(prompt).toContain("focused `specops-explorer` follow-up");
        expect(prompt).toContain("`specops-planner` USER DECISION REQUIRED flow");
        expect(prompt).toContain("`specops-designer` USER DECISION REQUIRED flow");
        expect(prompt).toContain("ordinary implementation/test failure");
        expect(prompt).toContain("Reviewer FAIL");
        expect(prompt).toContain("Never resolve a blocker by taking over specialist-owned work");
    });
});

describe("interactive coordinator contract", () => {
    const prompt = buildCoordinatorPrompt("interactive", false);

    test("keeps the plan approval checkpoint and resume semantics", () => {
        expect(prompt).toContain("## Plan checkpoint");
        expect(prompt).toContain("implementation has not started");
        expect(prompt).toContain("`isPlanningComplete: true`");
        expect(prompt).toContain("omits that flag while the `applyRequires` closure is satisfied");
        expect(prompt).toContain("tasks-mapped artifact's checkbox state");
        expect(prompt).not.toContain("`totalTasks > 0`");
        expect(prompt).not.toContain("`completedTasks == 0`");
        expect(prompt).toContain("If any task is already complete");
        expect(prompt).toContain("skip this checkpoint and resume the workflow");
        expect(prompt).toContain("do not call `specops_context` again");
    });

    test("plan checkpoint exposes exactly the intended approval path", () => {
        const section = prompt.slice(
            prompt.indexOf("## Plan checkpoint"),
            prompt.indexOf("## Lossless"),
        );
        expect(section).toContain("header: `Plan ready`");
        expect(section).toContain("sole option: `Start implementation`");
        expect(section).toContain(
            "OpenCode enables the native type-your-own-answer path by default",
        );
        expect(section).toContain("do not add a `custom` field");
        expect(section).toContain("omit `multiple` for single-select");
        expect(section).toContain(
            "Do not add `Leave open`, `Revise plan`, or any other explicit option",
        );
    });

    test("plan feedback routes to owners and always requires reapproval", () => {
        const section = prompt.slice(
            prompt.indexOf("## Plan checkpoint"),
            prompt.indexOf("## Lossless"),
        );
        expect(section).toContain("treat the text verbatim as plan feedback; do not implement");
        expect(section).toContain("Planner requirements pass");
        expect(section).toContain("Designer");
        expect(section).toContain("Planner tasks pass");
        expect(section).toContain(
            "requirements change → Designer if affected → Planner tasks if affected",
        );
        expect(section).toContain("Any revision invalidates prior approval");
        expect(section).toContain(
            "implementation starts only after `Start implementation` is selected",
        );
        expect(section).toContain("Do not persist separate approval state");
    });

    test("transports Planner/Designer decisions losslessly", () => {
        const section = prompt.slice(
            prompt.indexOf("## Lossless specialist decisions"),
            prompt.indexOf("## Review lifecycle checkpoint"),
        );
        expect(section).toContain("Only `specops-planner` and `specops-designer`");
        expect(section).toContain("`Decision`");
        expect(section).toContain("`Why it matters`");
        expect(section).toContain("all 2–4 supplied options, in supplied order");
        expect(section).toContain("every option's trade-off");
        expect(section).toContain("`Recommendation`");
        expect(section).toContain("`Affected artifact`");
        expect(section).toContain(
            "Do not add, remove, merge, reorder, rank, pre-select, or invent options",
        );
        expect(section).toContain("If the envelope is malformed");
        expect(section).toContain("return it to the same specialist for correction");
        expect(section).toContain("must identify the first supplied option");
        expect(section).toContain("rather than reordering it yourself");
        expect(section).toContain("append ` (Recommended)` to that first option's native label");
        expect(section).toContain("leave its supplied trade-off unchanged");
        expect(section).toContain("custom answer back verbatim");
        expect(section).toContain("**same specialist**");
        expect(section).toContain("**same pass and same artifact**");
        expect(section).toContain("Never batch separate decision envelopes");
    });

    test("keeps exact PASS and FAIL lifecycle choices in order", () => {
        const section = prompt.slice(prompt.indexOf("## Review lifecycle checkpoint"));
        const passArchive = section.indexOf("`Complete and archive`");
        const passLeaveOpen = section.indexOf("`Leave open`");
        expect(passArchive).toBeGreaterThan(-1);
        expect(passLeaveOpen).toBeGreaterThan(passArchive);
        expect(section).toContain("header `Review passed`");
        expect(section).toContain(
            "The change passed independent review. What would you like to do?",
        );

        const failStart = section.indexOf("For FAIL, use header");
        const fail = section.slice(failStart);
        const revise = fail.indexOf("`Revise implementation`");
        const archive = fail.indexOf("`Archive despite findings`");
        const leaveOpen = fail.indexOf("`Leave open`");
        expect(revise).toBeGreaterThan(-1);
        expect(archive).toBeGreaterThan(revise);
        expect(leaveOpen).toBeGreaterThan(archive);
        expect(fail).toContain("header `Review needs attention`");
        expect(fail).toContain("The reviewer found blocking issues. What would you like to do?");

        expect(section).toContain(
            "The selected option is the archive/lifecycle confirmation; do not ask again",
        );
        expect(section).toContain("call `specops_archive` once");
        expect(section).toContain("do not retry or use a filesystem fallback");
    });

    test("keeps interactive remediation user-controlled and lossless", () => {
        const section = prompt.slice(prompt.indexOf("## Interactive review remediation"));
        expect(section).toContain("complete Reviewer FAIL findings verbatim");
        expect(section).toContain("every `F1..Fn`");
        expect(section).toContain("Do not summarize, paraphrase, renumber, or drop findings");
        expect(section).toContain("re-dispatch `specops-reviewer`");
        expect(section).toContain("prior FAIL findings verbatim");
        expect(section).toContain("same review lifecycle checkpoint");
        expect(section).toContain("Never auto-remediate in interactive mode");
        expect(section).toContain("only if the user selects `Revise implementation` again");
    });
});

describe("Auto coordinator contract", () => {
    const prompt = buildCoordinatorPrompt("auto", false);

    test("has no interactive checkpoint policy and runtime instruction forbids questions", () => {
        expect(prompt).not.toContain("## Interactive policy");
        expect(prompt).not.toContain("## Plan checkpoint");
        expect(prompt).not.toContain("## Review lifecycle checkpoint");
        expect(prompt).not.toContain("Start implementation");
        expect(prompt).not.toContain("Review passed");
        expect(prompt).not.toContain("Review needs attention");
        expect(prompt).toContain("Never invoke OpenCode's native `question` tool");
    });

    test("continues automatically from a completed plan", () => {
        expect(prompt).toContain("## Autonomous plan continuation");
        expect(prompt).toContain("`isPlanningComplete: true`");
        expect(prompt).toContain("absent plus satisfied `applyRequires`");
        expect(prompt).toContain("auto-approves `specops-implementer`");
        expect(prompt).toContain("auto-approves `specops-implementer`");
        expect(prompt).toContain("No checkpoint/state");
    });

    test("does not retain the old workflow state machine or four-artifact sequence", () => {
        for (const prompt of [
            buildCoordinatorPrompt("interactive", false),
            buildCoordinatorPrompt("auto", false),
        ]) {
            expect(prompt).not.toContain("## Workflow state machine");
            expect(prompt).not.toContain("proposal → specs → design → tasks");
        }
    });

    test("scenario a: the default flow maps requirements, design, tasks, and plan readiness", () => {
        expect(prompt).toContain("design → specops-designer");
        expect(prompt).toContain("`specops-designer`");
        expect(prompt).toContain("other → specops-planner");
        expect(prompt).toContain("mode-specific plan policy");
    });

    test("scenario b: reordered and parallel artifacts use readiness and schema order", () => {
        expect(prompt).toContain("reverse-dependency reachability");
        expect(prompt).toContain("then schema order");
        expect(prompt).toContain("Static specialist rule (mapping, not ordering)");
        expect(prompt).toContain("ignore outside artifacts");
    });

    test("scenario c: omitted artifacts are not required by the coordinator", () => {
        expect(prompt).toContain("Planning artifacts are exactly those declared by the schema");
        expect(prompt).not.toContain("design.md");
        expect(prompt).not.toContain("tasks.md");
    });

    test("scenario d: skipped artifacts satisfy dependents and are never authored", () => {
        expect(prompt).toContain("`done`/`skipped` satisfy");
        expect(prompt).toContain("skipped never targets authoring");
        expect(prompt).toContain("skipped-artifact ids to ignore as do-not-read/do-not-author");
    });

    test("scenario e: custom ids use role metadata and the generic planner fallback", () => {
        expect(prompt).toContain("other →");
        expect(prompt).toContain("other → specops-planner");
        expect(prompt).toContain("structured per-dispatch payload");
    });

    test("scenario f: resumed changes re-derive routing from fresh status", () => {
        expect(prompt).toContain("read `specops_status`");
        expect(prompt).toContain("fresh-read status after every handoff that completes/skips");
        expect(prompt).toContain("never cache");
    });

    test("scenario g: planning completion reaches interactive approval or auto approval", () => {
        const interactive = buildCoordinatorPrompt("interactive", false);
        const auto = buildCoordinatorPrompt("auto", false);
        expect(interactive).toContain(
            "Satisfied closure plus `isPlanningComplete: true` or absent flag permits mode-specific plan policy",
        );
        expect(interactive).toContain("## Plan checkpoint");
        expect(auto).toContain("Fresh status: `isPlanningComplete: true`");
        expect(auto).toContain("auto-approves `specops-implementer`");
    });

    test("BLOCKED paths route to planner decisions instead of auto-recovery", () => {
        expect(prompt).toContain("Missing ids are BLOCKED");
        expect(prompt).toContain("through Planner");
        expect(prompt).toContain("never fabricate");
        expect(prompt).toContain("`false` with satisfied closure is BLOCKED");
        expect(prompt).toContain("No feasible artifact is BLOCKED");
    });

    test("chooses only within the supplied specialist decision domain", () => {
        const section = prompt.slice(
            prompt.indexOf("## Autonomous specialist decisions"),
            prompt.indexOf("## Autonomous Frontier"),
        );
        expect(section).toContain("choose exactly one of the specialist's options");
        expect(section).toContain("do not invent, merge, or rewrite alternatives");
        expect(section).toContain("If the envelope is malformed");
        expect(section).toContain("return it to the same specialist for correction");
        expect(section).toContain("specialist recommendation");
        expect(section).toContain("user's explicit goal and constraints");
        expect(section).toContain("approved/current OpenSpec requirements");
        expect(section).toContain(
            "repository evidence, Project Context, and established conventions",
        );
        expect(section).toContain("simplest/lowest-risk option deterministically");
        expect(section).toContain("**same specialist**");
        expect(section).toContain("**same pass and same artifact**");
    });

    test("distinguishes ambiguity from genuinely unknowable blockers", () => {
        expect(prompt).toContain("Ambiguity alone is not a blocker");
        expect(prompt).toContain("Never fabricate external facts, credentials, secret values");
        expect(prompt).toContain("genuinely unknowable information");
    });

    test("automatically remediates review FAIL with a hard two-round limit", () => {
        const section = prompt.slice(prompt.indexOf("## Autonomous review remediation"));
        expect(section).toContain("PASS → call `specops_archive` once");
        expect(section).toContain("FAIL → automatically begin review remediation");
        expect(section).toContain("complete FAIL findings verbatim");
        expect(section).toContain("every `F1..Fn`");
        expect(section).toContain("at most **2 remediation rounds total**");
        expect(section).toContain("re-review after round 2 still FAIL → `BLOCKED`");
        expect(section).toContain("Never run a third remediation round and never loop");
    });

    test("retains terminal COMPLETED/BLOCKED result contracts", () => {
        expect(prompt).toContain("`COMPLETED`");
        expect(prompt).toContain("OpenSpec change: <change name>");
        expect(prompt).toContain("archive result:");
        expect(prompt).toContain("`BLOCKED`");
        expect(prompt).toContain("stopped at: <workflow phase>");
        expect(prompt).toContain("to continue: <required information or action>");
    });
});

describe("coordinator registration", () => {
    test("registers interactive and Auto with their assembled prompts and hard question boundary", () => {
        const interactiveConfig: Config = {};
        const autoConfig: Config = {};
        registerCoordinatorAgent(interactiveConfig, makeConfig());
        registerAutoCoordinatorAgent(autoConfig, makeConfig());

        expect(promptOf(interactiveConfig, SPECOPS_AGENT_ID)).toBe(
            buildCoordinatorPrompt("interactive", false),
        );
        expect(promptOf(autoConfig, SPECOPS_AUTO_AGENT_ID)).toBe(
            buildCoordinatorPrompt("auto", false),
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
        expect(interactivePermission.doom_loop).toBe("deny");
        expect(autoPermission.doom_loop).toBe("deny");
        expect(interactivePermission.bash).toEqual({
            "*": "deny",
            "openspec --help": "allow",
            "openspec * --help": "allow",
        });
        expect(autoPermission.bash).toEqual(interactivePermission.bash);
        expect(interactivePermission[SPECOPS_LIFECYCLE_PERMISSION]).toBe("allow");
        expect(autoPermission[SPECOPS_LIFECYCLE_PERMISSION]).toBe("allow");
    });

    test("restricts both coordinators to the private SpecOps subagent namespace", () => {
        const configs: Config[] = [{}, {}];
        registerCoordinatorAgent(configs[0], makeConfig());
        registerAutoCoordinatorAgent(configs[1], makeConfig());

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

    test("uses the same coordinator capability policy in both modes", () => {
        const interactive: Config = {};
        const auto: Config = {};
        registerCoordinatorAgent(interactive, makeConfig());
        registerAutoCoordinatorAgent(auto, makeConfig());

        expect(interactive.agent?.[SPECOPS_AGENT_ID]?.permission).toMatchObject(
            COORDINATOR_PERMISSION,
        );
        expect(auto.agent?.[SPECOPS_AUTO_AGENT_ID]?.permission).toMatchObject(
            COORDINATOR_PERMISSION,
        );
    });

    test("registered prompts include Frontier only when configured", () => {
        const disabled: Config = {};
        const enabled: Config = {};
        registerCoordinatorAgent(disabled, makeConfig({}, false));
        registerCoordinatorAgent(enabled, makeConfig({}, true));

        expect(promptOf(disabled, SPECOPS_AGENT_ID)).not.toContain(
            "Frontier escalation is enabled for this session",
        );
        expect(promptOf(enabled, SPECOPS_AGENT_ID)).toContain(
            "Frontier escalation is enabled for this session",
        );
    });

    test("applies configured coordinator model and variant", () => {
        const config: Config = {};
        registerCoordinatorAgent(
            config,
            makeConfig({
                [AGENT_IDS.coordinator]: {
                    model: "opencode-go/deepseek-v4-flash",
                    variant: "high",
                },
            }),
        );

        expect(config.agent?.[SPECOPS_AGENT_ID]).toMatchObject({
            model: "opencode-go/deepseek-v4-flash",
            variant: "high",
        });
    });

    test("Auto shares the configured coordinator model and variant", () => {
        const config: Config = {};
        registerAutoCoordinatorAgent(
            config,
            makeConfig({
                [AGENT_IDS.coordinator]: {
                    model: "opencode-go/deepseek-v4-flash",
                    variant: "high",
                },
            }),
        );

        expect(config.agent?.[SPECOPS_AUTO_AGENT_ID]).toMatchObject({
            model: "opencode-go/deepseek-v4-flash",
            variant: "high",
        });
    });

    test("applies model without variant when only model is configured", () => {
        const config: Config = {};
        registerCoordinatorAgent(
            config,
            makeConfig({ [AGENT_IDS.coordinator]: { model: "openai/gpt-5" } }),
        );

        expect(config.agent?.[SPECOPS_AGENT_ID]?.model).toBe("openai/gpt-5");
        expect("variant" in (config.agent?.[SPECOPS_AGENT_ID] ?? {})).toBe(false);
    });

    test("omits model and variant for blank model to preserve OpenCode default", () => {
        const config: Config = {};
        registerCoordinatorAgent(
            config,
            makeConfig({ [AGENT_IDS.coordinator]: { model: "   ", variant: "high" } }),
        );

        expect("model" in (config.agent?.[SPECOPS_AGENT_ID] ?? {})).toBe(false);
        expect("variant" in (config.agent?.[SPECOPS_AGENT_ID] ?? {})).toBe(false);
    });

    test("does not modify existing built-in agents", () => {
        const config: Config = {
            agent: {
                build: { description: "Build", mode: "primary", prompt: "Build prompt" },
                plan: { description: "Plan", mode: "primary", prompt: "Plan prompt" },
            },
        };
        registerCoordinatorAgent(config, makeConfig());

        expect(config.agent?.build?.description).toBe("Build");
        expect(config.agent?.plan?.description).toBe("Plan");
    });
});
