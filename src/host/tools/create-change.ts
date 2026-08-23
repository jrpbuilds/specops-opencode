import type { Plugin } from "@opencode-ai/plugin";
import { createOpenSpecChange } from "../../openspec/create-change.js";
import { createChange } from "../../tools/create-change.js";
import { assertLifecycleAuthority } from "../authorization.js";
import { resolveSessionDirectory } from "../session.js";
import {
    CREATE_CHANGE_INPUT,
    optionalStringField,
    stringField,
    type ToolDraft,
} from "./shared.js";

export function addCreateChangeTool(tools: ToolDraft, ctx: Plugin.Context): void {
    tools.add(
        "specops_create_change",
        {
            description: "Create a named OpenSpec change using the native OpenSpec creation operation.",
            input: CREATE_CHANGE_INPUT,
            execute: async (input, context) => {
                await assertLifecycleAuthority(ctx, "specops_create_change", context);
                await context.progress({ title: "Creating OpenSpec change…" });
                const directory = await resolveSessionDirectory(ctx, context.sessionID);
                const change = stringField(input, "change");
                const goal = optionalStringField(input, "goal");
                return {
                    content: await createChange(change, goal, {
                        createChange: (name, requestedGoal) =>
                            createOpenSpecChange(name, directory, requestedGoal),
                    }),
                };
            },
        },
        { codemode: false },
    );
}
