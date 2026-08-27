import { describe, expect, test } from "bun:test";
import {
    ALL_AGENT_IDS,
    AGENT_IDS,
    ROLE_WORKFLOW_ORDER,
    type AgentId,
} from "../../src/agents/ids.js";
import {
    DEFAULT_AUTO_REVIEW_ITERATIONS,
    DEFAULT_SUBAGENT_CONCURRENCY,
    type AgentConfig,
    type SpecOpsConfig,
} from "../../src/config.js";
import { agentDisplayName, configuredModels, type ConfiguredModel } from "../../src/models.js";
import {
    changedAgentIds,
    describeSelection,
    formatConfiguredValue,
} from "../../src/tui/display.js";
import { allProviders } from "../fixtures.js";

const models = configuredModels(allProviders);
const glm = models.find(model => model.id.endsWith("GLM-5.2"))!;
const gpt4o = models.find(model => model.id.endsWith("gpt-4o"))!;

/**
 * Build a complete configuration with one entry per role.
 *
 * @param entries Role overrides layered over blank defaults.
 * @param extra Remaining configuration fields such as the concurrency limit.
 * @returns A complete staged configuration for helper assertions.
 */
function configWith(
    entries: ReadonlyArray<[AgentId, AgentConfig]> = [],
    extra: Partial<SpecOpsConfig> = {},
): SpecOpsConfig {
    const overrides = new Map(entries);
    return {
        agents: Object.fromEntries(
            ALL_AGENT_IDS.map(id => [id, overrides.get(id) ?? {}]),
        ) as SpecOpsConfig["agents"],
        frontierEscalation: false,
        maxSubagentConcurrency: DEFAULT_SUBAGENT_CONCURRENCY,
        maxAutoReviewIterations: DEFAULT_AUTO_REVIEW_ITERATIONS,
        ...extra,
    };
}

describe("normalized SpecOpsConfig shape", () => {
    test("configWith produces non-optional numeric fields", () => {
        const config = configWith();

        expect(config.maxSubagentConcurrency).toBe(DEFAULT_SUBAGENT_CONCURRENCY);
        expect(config.maxAutoReviewIterations).toBe(DEFAULT_AUTO_REVIEW_ITERATIONS);
        expect(typeof config.maxSubagentConcurrency).toBe("number");
        expect(typeof config.maxAutoReviewIterations).toBe("number");
    });
});

describe("formatConfiguredValue", () => {
    test("marks values above the selectable range as manually configured", () => {
        expect(formatConfiguredValue(12, 8)).toBe("12 (manual)");
    });

    test("keeps selectable values compact", () => {
        expect(formatConfiguredValue(8, 8)).toBe("8");
    });
});

describe("changedAgentIds", () => {
    test("returns no roles when the configurations match", () => {
        const initial = configWith([[AGENT_IDS.planner, { model: glm.id }]]);
        expect(changedAgentIds(initial, structuredClone(initial))).toEqual([]);
    });

    test("detects model and variant changes", () => {
        const initial = configWith([
            [AGENT_IDS.planner, { model: glm.id, variant: "high" }],
            [AGENT_IDS.reviewer, { model: gpt4o.id }],
        ]);
        const staged = configWith([
            [AGENT_IDS.planner, { model: glm.id, variant: "low" }],
            [AGENT_IDS.reviewer, { model: glm.id }],
        ]);
        expect(changedAgentIds(initial, staged)).toEqual([AGENT_IDS.planner, AGENT_IDS.reviewer]);
    });

    test("reports roles in fixed ALL_AGENT_IDS order", () => {
        const initial = configWith();
        const staged = configWith([
            [AGENT_IDS.frontier, { model: glm.id }],
            [AGENT_IDS.coordinator, { model: glm.id }],
        ]);
        expect(changedAgentIds(initial, staged)).toEqual([
            AGENT_IDS.coordinator,
            AGENT_IDS.frontier,
        ]);
    });
});

describe("describeSelection", () => {
    test("keeps Reviewer before its specialist display names", () => {
        const names = ROLE_WORKFLOW_ORDER.map(agentDisplayName);
        const reviewerIndex = names.indexOf("Reviewer");

        expect(names.slice(reviewerIndex, reviewerIndex + 4)).toEqual([
            "Reviewer",
            "Review - Correctness",
            "Review - Risk",
            "Review - Quality",
        ]);
    });

    test("describes roles without a model as using the OpenCode default", () => {
        expect(describeSelection(configWith(), AGENT_IDS.planner, models)).toBe("OpenCode default");
        expect(
            describeSelection(
                configWith([[AGENT_IDS.planner, { model: "  " }]]),
                AGENT_IDS.planner,
                models,
            ),
        ).toBe("OpenCode default");
    });

    test("formats a known model with its variant or the default label", () => {
        const config = configWith([
            [AGENT_IDS.planner, { model: glm.id, variant: "high" }],
            [AGENT_IDS.reviewer, { model: gpt4o.id }],
        ]);
        expect(describeSelection(config, AGENT_IDS.planner, models)).toBe("GLM-5.2 · high");
        expect(describeSelection(config, AGENT_IDS.reviewer, models)).toBe("GPT-4o · Default");
    });

    test("shows unset critics with Reviewer's effective model and variant", () => {
        const config = configWith([[AGENT_IDS.reviewer, { model: gpt4o.id, variant: "high" }]]);

        expect(describeSelection(config, AGENT_IDS.reviewCorrectness, models)).toBe(
            "GPT-4o · high",
        );
    });

    test("shows an unset critic using the host default when Reviewer is unset", () => {
        expect(describeSelection(configWith(), AGENT_IDS.reviewRisk, models)).toBe(
            "OpenCode default",
        );
    });

    test("shows explicit critic model and variant directly", () => {
        const config = configWith([
            [AGENT_IDS.reviewer, { model: gpt4o.id, variant: "high" }],
            [AGENT_IDS.reviewQuality, { model: glm.id, variant: "low" }],
        ]);

        expect(describeSelection(config, AGENT_IDS.reviewQuality, models)).toBe("GLM-5.2 · low");
    });

    test("does not apply Reviewer's variant to a critic's own model", () => {
        const config = configWith([
            [AGENT_IDS.reviewer, { model: gpt4o.id, variant: "high" }],
            [AGENT_IDS.reviewRisk, { model: glm.id }],
        ]);

        expect(describeSelection(config, AGENT_IDS.reviewRisk, models)).toBe("GLM-5.2 · Default");
    });

    test("keeps unknown saved models visible by id", () => {
        const config = configWith([[AGENT_IDS.planner, { model: "gone/removed-model" }]]);
        expect(describeSelection(config, AGENT_IDS.planner, models)).toBe(
            "gone/removed-model · Default",
        );
    });

    test("truncates long display names to keep role rows readable", () => {
        const longName = "A very long provider and model display name";
        const longModel: ConfiguredModel = { ...glm, name: longName };
        const catalogue = [...models.filter(model => model.id !== longModel.id), longModel];
        const config = configWith([[AGENT_IDS.planner, { model: longModel.id, variant: "high" }]]);

        const description = describeSelection(config, AGENT_IDS.planner, catalogue);

        expect(description.startsWith(`${longName.slice(0, 28)}...`)).toBe(true);
        expect(description.endsWith("high")).toBe(true);
    });
});
