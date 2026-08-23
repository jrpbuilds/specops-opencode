import { describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG, type SpecOpsConfig } from "../../src/config.js";
import { AGENT_IDS } from "../../src/agents/ids.js";
import {
    autoCoordinatorAgentDefinition,
    interactiveCoordinatorAgentDefinition,
} from "../../src/agents/coordinator.js";
import { explorerAgentDefinition } from "../../src/agents/explorer.js";
import { plannerAgentDefinition } from "../../src/agents/planner.js";
import { designerAgentDefinition } from "../../src/agents/designer.js";
import { implementerAgentDefinition } from "../../src/agents/implementer.js";
import { reviewerAgentDefinition } from "../../src/agents/reviewer.js";
import { frontierAgentDefinition } from "../../src/agents/frontier.js";

function config(): SpecOpsConfig {
    return structuredClone(DEFAULT_CONFIG);
}

const specialistFactories = [
    [AGENT_IDS.explorer, explorerAgentDefinition],
    [AGENT_IDS.planner, plannerAgentDefinition],
    [AGENT_IDS.designer, designerAgentDefinition],
    [AGENT_IDS.implementer, implementerAgentDefinition],
    [AGENT_IDS.reviewer, reviewerAgentDefinition],
    [AGENT_IDS.frontier, frontierAgentDefinition],
] as const;

describe("host-neutral SpecOps agent definitions", () => {
    test("keeps every specialist hidden, subordinate, prompt-backed, and unpinned by default", () => {
        const value = config();
        for (const [id, factory] of specialistFactories) {
            const definition = factory(value);
            expect(definition.id).toBe(id);
            expect(definition.mode).toBe("subagent");
            expect(definition.hidden).toBe(true);
            expect(definition.prompt.length).toBeGreaterThan(100);
            expect(definition.model).toBeUndefined();
            expect(definition.variant).toBeUndefined();
        }
    });

    test("preserves configured model and variant for every role", () => {
        const value = config();
        for (const id of Object.values(AGENT_IDS)) {
            value.agents[id] = { model: "openai/gpt-5.6", variant: "high" };
        }

        for (const [, factory] of specialistFactories) {
            expect(factory(value)).toMatchObject({ model: "openai/gpt-5.6", variant: "high" });
        }
        expect(interactiveCoordinatorAgentDefinition(value)).toMatchObject({
            model: "openai/gpt-5.6",
            variant: "high",
        });
        expect(autoCoordinatorAgentDefinition(value)).toMatchObject({
            model: "openai/gpt-5.6",
            variant: "high",
        });
    });

    test("keeps interactive and autonomous coordinator policies distinct", () => {
        const value = config();
        const interactive = interactiveCoordinatorAgentDefinition(value);
        const auto = autoCoordinatorAgentDefinition(value);

        expect(interactive.mode).toBe("primary");
        expect(auto.mode).toBe("primary");
        expect(interactive.permission.question).toBe("allow");
        expect(auto.permission.question).toBe("deny");
        expect(interactive.prompt).not.toContain("## Autonomous operation (SpecOps Auto)");
        expect(auto.prompt).toContain("## Autonomous operation (SpecOps Auto)");
    });

    test("includes Frontier policy only when escalation is enabled", () => {
        const disabled = interactiveCoordinatorAgentDefinition(config());
        const enabledConfig = config();
        enabledConfig.frontierEscalation = true;
        const enabled = interactiveCoordinatorAgentDefinition(enabledConfig);

        expect(disabled.prompt).not.toContain("specops-frontier");
        expect(enabled.prompt).toContain("specops-frontier");
    });
});
