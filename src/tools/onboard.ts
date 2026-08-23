/**
 * OpenSpec operations injected into onboarding.
 *
 * Keeping availability, initialization detection, and initialization separate
 * makes the decision order explicit and lets the deterministic flow be tested
 * without requiring a real CLI or project filesystem.
 */
export type OnboardDeps = {
    isAvailable: () => Promise<boolean>;
    isInitialized: () => Promise<boolean>;
    initialize: () => Promise<{ ok: boolean; stderr: string }>;
};

/**
 * Ensure the current project is ready for OpenSpec work.
 *
 * The flow checks the CLI before inspecting the project, leaves an initialized
 * project untouched, and only invokes initialization when it is necessary.
 *
 * @param deps OpenSpec operations used by the onboarding decisions.
 * @returns A concise human-readable status or failure message.
 */
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
