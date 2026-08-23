import type { Plugin } from "@opencode-ai/plugin/tui";
import { showModelEditor } from "./model-editor.js";

const COMMAND_NAME = "specops.models.configure";

/** Register the OpenCode 2 command-palette entry for SpecOps configuration. */
export function registerModelSettings(ctx: Plugin.Context): void {
    let editorOpen = false;

    ctx.keymap.layer(() => ({
        commands: [
            {
                id: COMMAND_NAME,
                title: "SpecOps Configure",
                description: "Choose a configured OpenCode model and variant for each role",
                group: "SpecOps",
                palette: true,
                enabled: () => !editorOpen,
                run: async () => {
                    if (editorOpen) return;
                    editorOpen = true;
                    try {
                        await showModelEditor(ctx);
                    } catch (error) {
                        ctx.ui.toast.show({
                            variant: "error",
                            title: "SpecOps model settings",
                            message: error instanceof Error ? error.message : String(error),
                        });
                    } finally {
                        editorOpen = false;
                    }
                },
            },
        ],
    }));
}
