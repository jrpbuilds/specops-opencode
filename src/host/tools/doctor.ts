import type { Plugin } from "@opencode-ai/plugin";
import { loadConfig } from "../../config.js";
import { getOpenSpecVersion } from "../../openspec/cli.js";
import { runOpenSpecDoctor } from "../../openspec/doctor.js";
import { getSpecOpsVersion } from "../../version.js";
import { doctor } from "../../tools/doctor.js";
import { assertLifecycleAuthority } from "../authorization.js";
import { resolveSessionDirectory } from "../session.js";
import { EMPTY_INPUT, type ToolDraft } from "./shared.js";

export function addDoctorTool(tools: ToolDraft, ctx: Plugin.Context): void {
    tools.add({
        name: "specops_doctor",
        description:
            "Run SpecOps diagnostics: report versions, OpenSpec health, configuration validity, and model-role mappings.",
        input: EMPTY_INPUT,
        options: { codemode: false },
        execute: async (_input, context) => {
            await assertLifecycleAuthority(ctx, "specops_doctor", context);
            await context.progress({ title: "Running SpecOps doctor…" });
            const directory = await resolveSessionDirectory(ctx, context.sessionID);
            return {
                content: await doctor({
                    specopsVersion: getSpecOpsVersion,
                    openspecVersion: getOpenSpecVersion,
                    openspecDoctor: () => runOpenSpecDoctor(directory),
                    loadConfig: () => loadConfig(),
                }),
            };
        },
    });
}
