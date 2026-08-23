import { tool } from "@opencode-ai/plugin/tool";
import { isOpenSpecAvailable } from "../../openspec/cli.js";
import { initializeOpenSpec, isOpenSpecInitialized } from "../../openspec/init.js";
import { onboard } from "../../tools/onboard.js";
import { requireLifecyclePermission } from "../lifecycle-permission.js";

/**
 * Expose the deterministic onboarding flow as a SpecOps tool.
 *
 * OpenCode's session directory is passed to initialization and root detection
 * so the tool operates on the project selected by the current session.
 */
export const onboardTool = tool({
    description:
        "Onboard the current project for OpenSpec: check availability, detect an existing root, and run openspec init if needed.",
    args: {},
    async execute(_args, context) {
        await requireLifecyclePermission(context, "specops_onboard");
        context.metadata({ title: "Onboarding project for OpenSpec…" });
        return onboard({
            isAvailable: () => isOpenSpecAvailable(),
            isInitialized: () => isOpenSpecInitialized(context.directory),
            initialize: () => initializeOpenSpec(context.directory),
        });
    },
});
