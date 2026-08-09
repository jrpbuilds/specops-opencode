import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AGENT_IDS, type AgentId } from "./agents/ids.js";

const PROMPT_FILES: Partial<Record<AgentId, string>> = {
    [AGENT_IDS.coordinator]: "coordinator.md",
    [AGENT_IDS.explorer]: "explorer.md",
    [AGENT_IDS.planner]: "planner.md",
    [AGENT_IDS.designer]: "designer.md",
    [AGENT_IDS.implementer]: "implementer.md",
    [AGENT_IDS.reviewer]: "reviewer.md",
};

/**
 * Resolve the packaged Markdown prompt for source and packed installations.
 *
 * Prompts are located relative to the compiled module rather than the current
 * working directory, so the same lookup works before and after packaging.
 */
function promptPath(id: AgentId): string {
    const file = PROMPT_FILES[id];
    if (!file) throw new Error(`SpecOps prompt not registered for agent: ${id}`);
    return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "prompts", file);
}

/**
 * Load a registered agent prompt and reject missing or empty prompt assets.
 *
 * Failing during registration is intentional: an agent without its role
 * instructions would otherwise be present but behave without the SpecOps
 * contract.
 */
export function loadPrompt(id: AgentId): string {
    const prompt = readFileSync(promptPath(id), "utf8");
    const file = PROMPT_FILES[id]!;
    if (!prompt.trim()) throw new Error(`SpecOps prompt is empty: ${file}`);
    return prompt;
}
