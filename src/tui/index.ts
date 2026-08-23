import { Plugin } from "@opencode-ai/plugin/tui";
import { registerModelSettings } from "./registration.js";

/** Native OpenCode 2 TUI plugin entrypoint. */
export default Plugin.define({
    id: "specops",
    setup: ctx => {
        registerModelSettings(ctx);
    },
});

export { registerModelSettings };
