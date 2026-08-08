import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool";
import {
    initializeOpenSpec,
    isOpenSpecAvailable,
    isOpenSpecInitialized,
} from "../openspec/index.js";

/** Injected operations so branching is testable without a real openspec CLI. */
export type OnboardDeps = {
    isAvailable: () => Promise<boolean>;
    isInitialized: () => Promise<boolean>;
    initialize: () => Promise<{ ok: boolean; stderr: string }>;
};

/** Deterministic onboarding flow. Returns a human-readable result string. */
export async function onboard(deps: OnboardDeps): Promise<string> {
    if (!(await deps.isAvailable())) {
        return "OpenSpec is not installed. Install it with: npm install -g @fission-ai/openspec";
    }
    if (await deps.isInitialized()) {
        return "This project is already initialised for OpenSpec and is ready for spec-driven work.";
    }
    const result = await deps.initialize();
    if (result.ok) {
        return "OpenSpec was initialised successfully. The project is ready for spec-driven work.";
    }
    return `Failed to initialise OpenSpec: ${result.stderr}`.trim();
}

export const onboardTool: ToolDefinition = tool({
    description:
        "Onboard the current project for OpenSpec: check availability, detect an existing root, and run openspec init if needed.",
    args: {},
    async execute(_args, context) {
        context.metadata({ title: "Onboarding project for OpenSpec…" });
        return onboard({
            isAvailable: () => isOpenSpecAvailable(),
            isInitialized: () => isOpenSpecInitialized(context.directory),
            initialize: () => initializeOpenSpec(context.directory),
        });
    },
});
