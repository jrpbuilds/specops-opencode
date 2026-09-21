import { statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Packaged skills directory, resolved relative to this module.
 *
 * The lookup works identically for source checkouts (`<repo>/skills`) and
 * packed installs (`<package>/skills`), mirroring how `src/prompts.ts` locates
 * the packaged prompt assets.
 */
export const PACKAGED_SKILLS_DIR = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "skills",
);

/**
 * Check that a packaged skills directory exists and is a directory.
 *
 * A missing directory is not an error: packaged skills are an optional
 * capability layer, so a damaged install degrades to "no packaged skills"
 * instead of failing the plugin load.
 *
 * @param dir Candidate skills directory; defaults to the packaged tree.
 * @returns Whether the directory is present.
 */
export function packagedSkillsDirExists(dir: string = PACKAGED_SKILLS_DIR): boolean {
    return statSync(dir, { throwIfNoEntry: false })?.isDirectory() ?? false;
}
