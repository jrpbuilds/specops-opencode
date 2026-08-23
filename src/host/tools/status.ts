import type { Plugin } from "@opencode-ai/plugin";
import { getOpenSpecStatus } from "../../openspec/status.js";
import { status } from "../../tools/status.js";
import { assertLifecycleAuthority } from "../authorization.js";
import { resolveSessionDirectory } from "../session.js";
import { CHANGE_INPUT, stringField, type ToolDraft } from "./shared.js";

export function addStatusTool(tools: ToolDraft, ctx: Plugin.Context): void {
    tools.add(
        "specops_status",
        {
            description: "Read normalized OpenSpec workflow status for a named change.",
            input: CHANGE_INPUT,
            execute: async (input, context) => {
                await assertLifecycleAuthority(ctx, "specops_status", context);
                await context.progress({ title: "Reading OpenSpec status…" });
                const directory = await resolveSessionDirectory(ctx, context.sessionID);
                return {
                    content: await status(stringField(input, "change"), {
                        getOpenSpecStatus: change => getOpenSpecStatus(change, directory),
                    }),
                };
            },
        },
        { codemode: false },
    );
}
