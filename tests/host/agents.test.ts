import { describe, expect, test } from "bun:test";
import type { Config } from "@opencode-ai/plugin";
import {
    SPECOPS_AGENT_ID,
    SPECOPS_AUTO_AGENT_ID,
    interactiveCoordinatorAgentDefinition,
    autoCoordinatorAgentDefinition,
} from "../../src/agents/coordinator.js";
import { EXPLORER_AGENT_ID, explorerAgentDefinition } from "../../src/agents/explorer.js";
import { PLANNER_AGENT_ID, plannerAgentDefinition } from "../../src/agents/planner.js";
import { DESIGNER_AGENT_ID, designerAgentDefinition } from "../../src/agents/designer.js";
import { IMPLEMENTER_AGENT_ID, implementerAgentDefinition } from "../../src/agents/implementer.js";
import { REVIEWER_AGENT_ID, reviewerAgentDefinition } from "../../src/agents/reviewer.js";
import {
    REVIEW_CORRECTNESS_AGENT_ID,
    reviewCorrectnessAgentDefinition,
} from "../../src/agents/review-correctness.js";
import { REVIEW_RISK_AGENT_ID, reviewRiskAgentDefinition } from "../../src/agents/review-risk.js";
import {
    REVIEW_QUALITY_AGENT_ID,
    reviewQualityAgentDefinition,
} from "../../src/agents/review-quality.js";
import { FRONTIER_AGENT_ID, frontierAgentDefinition } from "../../src/agents/frontier.js";
import {
    DESIGNER_PERMISSION,
    EXPLORER_PERMISSION,
    FRONTIER_PERMISSION,
    IMPLEMENTER_PERMISSION,
    PLANNER_PERMISSION,
    REVIEWER_PERMISSION,
} from "../../src/agents/permissions.js";
import { DEFAULT_CONFIG, type SpecOpsConfig } from "../../src/config.js";
import {
    applyAgentDefinition,
    registerReviewCorrectnessAgent,
    registerReviewQualityAgent,
    registerReviewRiskAgent,
} from "../../src/host/agents.js";
import { loadPrompt } from "../../src/prompts.js";

function configWithRoleOverrides(
    overrides: Record<string, { model?: string; variant?: string }>,
): SpecOpsConfig {
    const config = structuredClone(DEFAULT_CONFIG);
    for (const [id, entry] of Object.entries(overrides)) {
        config.agents[id as keyof SpecOpsConfig["agents"]] = entry;
    }
    return config;
}

describe("applyAgentDefinition translation", () => {
    test("registers a definition under its id with mode and description passthrough", () => {
        const config: Config = {};
        applyAgentDefinition(config, explorerAgentDefinition(DEFAULT_CONFIG));

        const agent = config.agent?.[EXPLORER_AGENT_ID] as Record<string, unknown>;
        expect(agent.mode).toBe("subagent");
        expect(agent.hidden).toBe(true);
        expect(typeof agent.description).toBe("string");
        expect(agent.prompt).toBe(loadPrompt("specops-explorer"));
    });

    test("translates configured model and variant", () => {
        const config: Config = {};
        applyAgentDefinition(
            config,
            plannerAgentDefinition(
                configWithRoleOverrides({ "specops-planner": { model: "m", variant: "v" } }),
            ),
        );

        const agent = config.agent?.[PLANNER_AGENT_ID] as Record<string, unknown>;
        expect(agent.model).toBe("m");
        expect(agent.variant).toBe("v");
    });

    test("omits model and variant when the persisted selection is blank", () => {
        const config: Config = {};
        applyAgentDefinition(
            config,
            plannerAgentDefinition(
                configWithRoleOverrides({ "specops-planner": { model: "", variant: "" } }),
            ),
        );

        const agent = config.agent?.[PLANNER_AGENT_ID] as Record<string, unknown>;
        expect("model" in agent).toBe(false);
        expect("variant" in agent).toBe(false);
    });

    test("carries the canonical permission record through unchanged", () => {
        const definition = reviewerAgentDefinition(DEFAULT_CONFIG);
        const config: Config = {};
        applyAgentDefinition(config, definition);

        // Both sides are compared as neutral records: the registered slot is
        // SDK-typed, the definition side carries the structural policy shape.
        const registered = config.agent?.[REVIEWER_AGENT_ID]?.permission as Record<string, unknown>;
        expect(registered).toEqual(definition.permission as Record<string, unknown>);
    });

    test("maps every role to its registered id", () => {
        const config: Config = {};
        applyAgentDefinition(config, interactiveCoordinatorAgentDefinition(DEFAULT_CONFIG));
        applyAgentDefinition(config, autoCoordinatorAgentDefinition(DEFAULT_CONFIG));
        applyAgentDefinition(config, explorerAgentDefinition(DEFAULT_CONFIG));
        applyAgentDefinition(config, plannerAgentDefinition(DEFAULT_CONFIG));
        applyAgentDefinition(config, designerAgentDefinition(DEFAULT_CONFIG));
        applyAgentDefinition(config, implementerAgentDefinition(DEFAULT_CONFIG));
        applyAgentDefinition(config, reviewCorrectnessAgentDefinition(DEFAULT_CONFIG));
        applyAgentDefinition(config, reviewRiskAgentDefinition(DEFAULT_CONFIG));
        applyAgentDefinition(config, reviewQualityAgentDefinition(DEFAULT_CONFIG));
        applyAgentDefinition(config, reviewerAgentDefinition(DEFAULT_CONFIG));
        applyAgentDefinition(config, frontierAgentDefinition(DEFAULT_CONFIG));

        expect(Object.keys(config.agent ?? {}).sort()).toEqual(
            [
                SPECOPS_AGENT_ID,
                SPECOPS_AUTO_AGENT_ID,
                EXPLORER_AGENT_ID,
                PLANNER_AGENT_ID,
                DESIGNER_AGENT_ID,
                IMPLEMENTER_AGENT_ID,
                REVIEW_CORRECTNESS_AGENT_ID,
                REVIEW_RISK_AGENT_ID,
                REVIEW_QUALITY_AGENT_ID,
                REVIEWER_AGENT_ID,
                FRONTIER_AGENT_ID,
            ].sort(),
        );
    });

    test("registers review specialists hidden, read-only, and without final-verdict authority", () => {
        const config: Config = {};
        const specOpsConfig = configWithRoleOverrides({
            ["specops-reviewer"]: { model: "reviewer/model", variant: "high" },
        });

        registerReviewCorrectnessAgent(config, specOpsConfig);
        registerReviewRiskAgent(config, specOpsConfig);
        registerReviewQualityAgent(config, specOpsConfig);

        for (const id of [
            REVIEW_CORRECTNESS_AGENT_ID,
            REVIEW_RISK_AGENT_ID,
            REVIEW_QUALITY_AGENT_ID,
        ] as const) {
            const agent = config.agent?.[id] as Record<string, unknown>;
            const permission = agent.permission as Record<string, unknown>;
            expect(agent).toMatchObject({ mode: "subagent", hidden: true });
            expect(permission.edit).toEqual({ "*": "deny" });
            expect(agent.model).toBe("reviewer/model");
            expect(agent.variant).toBe("high");
            expect(agent.prompt).toContain("## Specialist evidence contract");
            expect(agent.prompt).toContain(
                "Never issue, imply, or recommend an overall PASS or FAIL",
            );
            expect(agent.prompt).toContain("specops-reviewer");
        }
    });
});

describe("runtime loop-guard placement", () => {
    test("interactive coordinator omits the guard so the host default governs", () => {
        const config: Config = {};
        applyAgentDefinition(config, interactiveCoordinatorAgentDefinition(DEFAULT_CONFIG));

        const permission = config.agent?.[SPECOPS_AGENT_ID]?.permission as Record<string, unknown>;
        expect("doom_loop" in permission).toBe(false);
        expect(permission.question).toBe("allow");
    });

    test("auto coordinator pins deny because headless asks cannot resolve", () => {
        const config: Config = {};
        applyAgentDefinition(config, autoCoordinatorAgentDefinition(DEFAULT_CONFIG));

        const permission = config.agent?.[SPECOPS_AUTO_AGENT_ID]?.permission as Record<
            string,
            unknown
        >;
        expect(permission.doom_loop).toBe("deny");
        expect(permission.question).toBe("deny");
    });

    test("every specialist pins allow and no role registers ask", () => {
        const specialists: Record<string, Record<string, unknown>> = {
            [EXPLORER_AGENT_ID]: EXPLORER_PERMISSION,
            [PLANNER_AGENT_ID]: PLANNER_PERMISSION,
            [DESIGNER_AGENT_ID]: DESIGNER_PERMISSION,
            [IMPLEMENTER_AGENT_ID]: IMPLEMENTER_PERMISSION,
            [REVIEWER_AGENT_ID]: REVIEWER_PERMISSION,
            [FRONTIER_AGENT_ID]: FRONTIER_PERMISSION,
        };
        for (const [id, permission] of Object.entries(specialists)) {
            const config: Config = {};
            applyAgentDefinition(config, {
                id,
                description: "contract probe",
                mode: "subagent",
                hidden: true,
                prompt: "",
                permission,
            });
            const registered = config.agent?.[id]?.permission as Record<string, unknown>;
            expect(registered.doom_loop).toBe("allow");
            expect(registered.doom_loop).not.toBe("ask");
        }
    });
});
