import type { TuiPluginApi } from "@opencode-ai/plugin/tui";
import { showModelEditor } from "./model-editor.js";

const COMMAND_NAME = "specops.models.configure";

/**
 * Register the command-palette entry that opens model configuration.
 *
 * The `editorOpen` guard prevents overlapping editor sessions, while the
 * lifecycle disposer removes the command when the TUI plugin is unloaded.
 *
 * @param api OpenCode TUI API used for command registration and notifications.
 * @returns Nothing; registration is performed through the supplied API.
 */
export function registerModelSettings(api: TuiPluginApi): void {
    let editorOpen = false;

    /**
     * Open the editor once and release the guard after it closes or fails.
     *
     * @returns A promise that settles after the editor closes or reports an error.
     */
    const openEditor = async (): Promise<void> => {
        if (editorOpen) return;
        editorOpen = true;
        try {
            await showModelEditor(api, () => {
                editorOpen = false;
            });
        } catch (error) {
            editorOpen = false;
            api.ui.toast({
                variant: "error",
                title: "SpecOps model settings",
                message: error instanceof Error ? error.message : String(error),
            });
        }
    };

    const unregisterCommand = api.keymap.registerLayer({
        commands: [
            {
                namespace: "palette",
                name: COMMAND_NAME,
                title: "SpecOps Configure",
                desc: "Choose a configured OpenCode model and variant for each role",
                category: "SpecOps",
                run: openEditor,
            },
        ],
    });

    api.lifecycle.onDispose(unregisterCommand);
}
