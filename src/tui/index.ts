import type { TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui";
import { registerModelSettings } from "./registration.js";

/**
 * TUI entry point loaded from the package's `./tui` export.
 *
 * The module intentionally exposes only the TUI factory; server-side plugin
 * registration remains in `src/index.ts`.
 */
const SpecOpsTuiPlugin = {
    id: "specops",
    tui: async (api: TuiPluginApi) => {
        registerModelSettings(api);
    },
} satisfies TuiPluginModule;

/** Export the native SpecOps TUI plugin module. */
export default SpecOpsTuiPlugin;

/** Register the SpecOps command-palette entries on an OpenCode TUI API. */
export { registerModelSettings };
