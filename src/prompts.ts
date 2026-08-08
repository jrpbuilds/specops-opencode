import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AGENT_IDS, type AgentId } from "./agents/ids.js";

const PROMPT_FILES: Partial<Record<AgentId, string>> = {
    [AGENT_IDS.coordinator]: "coordinator.md",
    [AGENT_IDS.explorer]: "explorer.md",
    [AGENT_IDS.planner]: "planner.md",
};

/** Resolve a package-relative Markdown prompt path for source and packed installs. */
function promptPath(id: AgentId): string {
    const file = PROMPT_FILES[id];
    if (!file) throw new Error(`SpecOps prompt not registered for agent: ${id}`);
    return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "prompts", file);
}

/** Load a packaged Markdown prompt and fail loudly when the asset is missing or empty. */
export function loadPrompt(id: AgentId): string {
    const prompt = readFileSync(promptPath(id), "utf8");
    const file = PROMPT_FILES[id]!;
    if (!prompt.trim()) throw new Error(`SpecOps prompt is empty: ${file}`);
    return prompt;
}
