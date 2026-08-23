import type { Plugin } from "@opencode-ai/plugin";
import { SPECOPS_AGENT_ID, SPECOPS_AUTO_AGENT_ID } from "../agents/coordinator.js";

export const LIFECYCLE_TOOL_IDS = [
    "specops_archive",
    "specops_context",
    "specops_create_change",
    "specops_doctor",
    "specops_onboard",
    "specops_status",
    "specops_validate_change",
] as const;

export type LifecycleToolId = (typeof LIFECYCLE_TOOL_IDS)[number];

const USER_FACING_TOOLS = new Set<LifecycleToolId>(["specops_doctor", "specops_onboard"]);
const COORDINATORS = new Set([SPECOPS_AGENT_ID, SPECOPS_AUTO_AGENT_ID]);

export function isSpecOpsSpecialist(agent: string): boolean {
    return agent.startsWith("specops-");
}

export function lifecycleToolVisible(tool: LifecycleToolId, agent: string): boolean {
    if (COORDINATORS.has(agent)) return true;
    if (isSpecOpsSpecialist(agent)) return false;
    return USER_FACING_TOOLS.has(tool);
}

/** Hard V2 execution authorization; definition filtering alone is not trusted. */
export async function assertLifecycleAuthority(
    ctx: Plugin.Context,
    tool: LifecycleToolId,
    invocation: { sessionID: string; agent: string },
): Promise<void> {
    if (COORDINATORS.has(invocation.agent)) return;
    if (!USER_FACING_TOOLS.has(tool) || isSpecOpsSpecialist(invocation.agent)) {
        throw new Error(`${invocation.agent} is not authorized to execute ${tool}`);
    }

    const session = await ctx.session.get({ sessionID: invocation.sessionID });
    const response = await ctx.agent.get({ agentID: invocation.agent, location: session.location });
    const agent = response.data;
    if (agent.mode !== "primary" && agent.mode !== "all") {
        throw new Error(`${invocation.agent} is not authorized to execute ${tool}`);
    }
}

/** Remove lifecycle tools from model context when the current agent lacks authority. */
export async function registerLifecycleToolVisibility(ctx: Plugin.Context): Promise<void> {
    await ctx.session.hook("context", event => {
        for (const tool of LIFECYCLE_TOOL_IDS) {
            if (!lifecycleToolVisible(tool, String(event.agent))) delete event.tools[tool];
        }
    });
}
