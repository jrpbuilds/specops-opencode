import path from "node:path";
import type { Plugin } from "@opencode-ai/plugin";

/** Resolve the current OpenCode 2 session location to an effective directory. */
export async function resolveSessionDirectory(
    ctx: Plugin.Context,
    sessionID: string,
): Promise<string> {
    const session = await ctx.session.get({ sessionID });
    const root = session.location?.directory?.trim();
    if (!root) throw new Error(`SpecOps could not resolve a directory for session '${sessionID}'`);
    return session.subpath?.trim() ? path.resolve(root, session.subpath) : root;
}
