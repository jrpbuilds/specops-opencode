import type { OpenSpecContextResult } from "../openspec/context.js";

/** Dependency boundary for the deterministic OpenSpec context tool. */
export type ContextDeps = {
    getContext: () => Promise<OpenSpecContextResult>;
};

/** Return current OpenSpec facts for Coordinator startup reasoning. */
export async function context(deps: ContextDeps): Promise<string> {
    return JSON.stringify(await deps.getContext(), null, 2);
}
