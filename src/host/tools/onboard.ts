import type { Plugin } from "@opencode-ai/plugin";
import { isOpenSpecAvailable } from "../../openspec/cli.js";
import { initializeOpenSpec, isOpenSpecInitialized } from "../../openspec/init.js";
import { onboard } from "../../tools/onboard.js";
import { assertLifecycleAuthority } from "../authorization.js";
import { resolveSessionDirectory } from "../session.js";
import { EMPTY_INPUT, type ToolDraft } from "./shared.js";

export function addOnboardTool(tools: ToolDraft, ctx: Plugin.Context): void {
    tools.add(
        "specops_onboard",
        {
            description:
                "Onboard the current project for OpenSpec: check availability, detect an existing root, and run openspec init if needed.",
            input: EMPTY_INPUT,
            execute: async (_input, context) => {
                await assertLifecycleAuthority(ctx, "specops_onboard", context);
                await context.progress({ title: "Onboarding project for OpenSpec…" });
                const directory = await resolveSessionDirectory(ctx, context.sessionID);
                return {
                    content: await onboard({
                        isAvailable: () => isOpenSpecAvailable(),
                        isInitialized: () => isOpenSpecInitialized(directory),
                        initialize: () => initializeOpenSpec(directory),
                    }),
                };
            },
        },
        { codemode: false },
    );
}
