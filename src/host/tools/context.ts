import type { Plugin } from "@opencode-ai/plugin";
import { getOpenSpecContext } from "../../openspec/context.js";
import { context as readContext } from "../../tools/context.js";
import { assertLifecycleAuthority } from "../authorization.js";
import { resolveSessionDirectory } from "../session.js";
import { EMPTY_INPUT, type ToolDraft } from "./shared.js";

export function addContextTool(tools: ToolDraft, ctx: Plugin.Context): void {
    tools.add({
        name: "specops_context",
        description:
            "Return deterministic current OpenSpec facts: availability, initialization, and active changes.",
        input: EMPTY_INPUT,
        options: { codemode: false },
        execute: async (_input, context) => {
            await assertLifecycleAuthority(ctx, "specops_context", context);
            await context.progress({ title: "Reading OpenSpec context…" });
            const directory = await resolveSessionDirectory(ctx, context.sessionID);
            return { content: await readContext({ getContext: () => getOpenSpecContext(directory) }) };
        },
    });
}
