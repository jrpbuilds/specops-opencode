import type { Plugin } from "@opencode-ai/plugin";
import { validateChange as runOpenSpecValidation } from "../../openspec/validate.js";
import { validateChange } from "../../tools/validate-change.js";
import { assertLifecycleAuthority } from "../authorization.js";
import { resolveSessionDirectory } from "../session.js";
import { CHANGE_INPUT, stringField, type ToolDraft } from "./shared.js";

export function addValidateChangeTool(tools: ToolDraft, ctx: Plugin.Context): void {
    tools.add({
        name: "specops_validate_change",
        description: "Validate one active OpenSpec change with strict, change-scoped validation.",
        input: CHANGE_INPUT,
        options: { codemode: false },
        execute: async (input, context) => {
            await assertLifecycleAuthority(ctx, "specops_validate_change", context);
            await context.progress({ title: "Validating OpenSpec change…" });
            const directory = await resolveSessionDirectory(ctx, context.sessionID);
            const result = await validateChange(stringField(input, "change"), {
                validateChange: change => runOpenSpecValidation(change, directory),
            });
            return { content: JSON.stringify(result) };
        },
    });
}
