import type { Plugin } from "@opencode-ai/plugin";
import type { SpecOpsAgentDefinition } from "../agents/definition.js";
import type { SpecOpsConfig } from "../config.js";
import {
    autoCoordinatorAgentDefinition,
    interactiveCoordinatorAgentDefinition,
    SPECOPS_AGENT_ID,
    SPECOPS_AUTO_AGENT_ID,
} from "../agents/coordinator.js";
import { explorerAgentDefinition } from "../agents/explorer.js";
import { plannerAgentDefinition } from "../agents/planner.js";
import { designerAgentDefinition } from "../agents/designer.js";
import { implementerAgentDefinition } from "../agents/implementer.js";
import { reviewerAgentDefinition } from "../agents/reviewer.js";
import { frontierAgentDefinition } from "../agents/frontier.js";
import { denyPrivateSpecOpsSubagents, toV2PermissionRules } from "./permissions.js";

type AgentDraft = Parameters<Parameters<Plugin.Context["agent"]["transform"]>[0]>[0];
type AgentItem = NonNullable<ReturnType<AgentDraft["get"]>>;

/** Whether an agent belongs to the private SpecOps workflow namespace. */
export function isSpecOpsAgentKey(key: string): boolean {
    return key === SPECOPS_AGENT_ID || key === SPECOPS_AUTO_AGENT_ID || key.startsWith("specops-");
}

/** Parse the persisted `provider/model` selection into OpenCode 2's Model.Ref. */
export function toV2ModelRef(model: string, variant?: string) {
    const slash = model.indexOf("/");
    if (slash <= 0 || slash === model.length - 1) {
        throw new Error(`invalid configured model '${model}': expected provider/model`);
    }
    return {
        providerID: model.slice(0, slash),
        id: model.slice(slash + 1),
        ...(variant ? { variant } : {}),
    };
}

/** Apply one host-neutral SpecOps role definition to an OpenCode 2 agent draft. */
export function applyAgentDefinition(draft: AgentItem, definition: SpecOpsAgentDefinition): void {
    draft.description = definition.description;
    draft.system = definition.prompt;
    draft.mode = definition.mode;
    draft.hidden = definition.hidden ?? false;
    draft.permissions = [...draft.permissions, ...toV2PermissionRules(definition.permission)];

    if (definition.model?.trim()) {
        draft.model = toV2ModelRef(definition.model.trim(), definition.variant) as AgentItem["model"];
    } else {
        delete draft.model;
    }
}

/** Register the private boundary and all configured SpecOps agents in V2. */
export async function registerAgents(
    ctx: Plugin.Context,
    specOpsConfig?: SpecOpsConfig,
): Promise<void> {
    await ctx.agent.transform(agents => {
        for (const agent of agents.list()) {
            if (isSpecOpsAgentKey(String(agent.id))) continue;
            agent.permissions = denyPrivateSpecOpsSubagents(agent.permissions);
        }

        if (!specOpsConfig) return;

        const definitions: SpecOpsAgentDefinition[] = [
            interactiveCoordinatorAgentDefinition(specOpsConfig),
            autoCoordinatorAgentDefinition(specOpsConfig),
            explorerAgentDefinition(specOpsConfig),
            plannerAgentDefinition(specOpsConfig),
            designerAgentDefinition(specOpsConfig),
            implementerAgentDefinition(specOpsConfig),
            reviewerAgentDefinition(specOpsConfig),
        ];
        if (specOpsConfig.frontierEscalation) definitions.push(frontierAgentDefinition(specOpsConfig));

        for (const definition of definitions) {
            agents.update(definition.id, draft => applyAgentDefinition(draft, definition));
        }
    });
}
