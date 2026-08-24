import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AGENT_IDS, type AgentId } from "./agents/ids.js";

/** Packaged prompt file backing each configurable role. */
const PROMPT_FILES: Partial<Record<AgentId, string>> = {
    [AGENT_IDS.coordinator]: "coordinator.md",
    [AGENT_IDS.explorer]: "explorer.md",
    [AGENT_IDS.planner]: "planner.md",
    [AGENT_IDS.designer]: "designer.md",
    [AGENT_IDS.implementer]: "implementer.md",
    [AGENT_IDS.reviewCorrectness]: "review-correctness.md",
    [AGENT_IDS.reviewRisk]: "review-risk.md",
    [AGENT_IDS.reviewQuality]: "review-quality.md",
    [AGENT_IDS.reviewer]: "reviewer.md",
    [AGENT_IDS.frontier]: "frontier.md",
};

/** Packaged prompts directory, resolved relative to the compiled module. */
const PROMPTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "prompts");
/** Matches whole-line {{include:...}} fragment directives. */
const INCLUDE_PATTERN = /^\{\{include:([^}]+)\}\}$/;

/**
 * Resolve the packaged Markdown prompt for source and packed installations.
 *
 * Prompts are located relative to the compiled module rather than the current
 * working directory, so the same lookup works before and after packaging.
 */
function promptPath(id: AgentId): string {
    const file = PROMPT_FILES[id];
    if (!file) throw new Error(`SpecOps prompt not registered for agent: ${id}`);
    return path.resolve(PROMPTS_DIR, file);
}

/**
 * Load a registered agent prompt and reject missing or empty prompt assets.
 *
 * Failing during registration is intentional: an agent without its role
 * instructions would otherwise be present but behave without the SpecOps
 * contract. Whole-line `{{include:...}}` directives are resolved before the
 * prompt is returned.
 */
export function loadPrompt(id: AgentId): string {
    const prompt = resolveIncludes(readFileSync(promptPath(id), "utf8"), PROMPTS_DIR);
    const file = PROMPT_FILES[id]!;
    if (!prompt.trim()) throw new Error(`SpecOps prompt is empty: ${file}`);
    return prompt;
}

/**
 * Load a packaged prompt asset by filename rather than by agent role.
 *
 * Used for prompt fragments that are not tied to a configurable role, such as
 * the autonomous appendix appended to the coordinator prompt for the
 * SpecOps Auto agent. Whole-line include directives are resolved from the
 * packaged prompts directory so the same lookup works before and after
 * packaging.
 */
export function loadPromptFile(filename: string): string {
    const filePath = path.resolve(PROMPTS_DIR, filename);
    const prompt = resolveIncludes(readFileSync(filePath, "utf8"), PROMPTS_DIR);
    if (!prompt.trim()) throw new Error(`SpecOps prompt is empty: ${filename}`);
    return prompt;
}

/**
 * Expand whole-line prompt fragment directives from a prompt directory.
 *
 * Includes are deliberately limited to a path-only form. Recursive includes
 * are supported for small shared contracts, while the stack prevents cycles
 * and the directory check prevents prompt assets from reading outside the
 * packaged prompts tree.
 */
export function resolveIncludes(content: string, dir: string, stack: string[] = []): string {
    const root = path.resolve(dir);

    return content
        .split("\n")
        .map(line => {
            const match = INCLUDE_PATTERN.exec(line.trim());
            if (!match) return line;

            const includePath = match[1].trim();
            const fragmentPath = path.resolve(root, includePath);
            if (fragmentPath !== root && !fragmentPath.startsWith(`${root}${path.sep}`)) {
                throw new Error(`SpecOps prompt include escapes prompts directory: ${includePath}`);
            }
            if (stack.includes(fragmentPath)) {
                throw new Error(`SpecOps prompt include cycle: ${includePath}`);
            }

            let fragment: string;
            try {
                fragment = readFileSync(fragmentPath, "utf8");
            } catch {
                throw new Error(`SpecOps prompt include not found: ${includePath}`);
            }
            if (!fragment.trim()) {
                throw new Error(`SpecOps prompt fragment is empty: ${includePath}`);
            }

            return resolveIncludes(fragment, root, [...stack, fragmentPath]).replace(/\r?\n$/, "");
        })
        .join("\n");
}
