import type { Plugin } from "@opencode-ai/plugin";
import { archiveChange } from "../../openspec/archive.js";
import { archive } from "../../tools/archive.js";
import { assertLifecycleAuthority } from "../authorization.js";
import { resolveSessionDirectory } from "../session.js";
import { CHANGE_INPUT, stringField, type ToolDraft } from "./shared.js";

export function addArchiveTool(tools: ToolDraft, ctx: Plugin.Context): void {
    tools.add({
        name: "specops_archive",
        description: "Archive a named OpenSpec change using the native OpenSpec archive operation.",
        input: CHANGE_INPUT,
        options: { codemode: false },
        execute: async (input, context) => {
            await assertLifecycleAuthority(ctx, "specops_archive", context);
            await context.progress({ title: "Archiving OpenSpec change…" });
            const directory = await resolveSessionDirectory(ctx, context.sessionID);
            const content = await archive(stringField(input, "change"), {
                archiveChange: change => archiveChange(change, directory),
            });
            return { content };
        },
    });
}
