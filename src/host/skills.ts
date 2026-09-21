import type { Config } from "@opencode-ai/plugin";
import { PACKAGED_SKILLS_DIR, packagedSkillsDirExists } from "../skills.js";

/**
 * OpenCode's `skills` configuration block.
 *
 * The plugin SDK does not type this field yet, so the host adapter works
 * against the documented runtime shape (`paths` and `urls` string arrays) and
 * narrows through a structural cast, following the same precedent as the
 * permission adapters in `src/host/permissions.ts`.
 */
type SkillsConfig = { paths?: string[]; urls?: string[] };

/**
 * Register the packaged SpecOps skills directory with the host.
 *
 * OpenCode discovers skills from every folder listed under `skills.paths`, so
 * appending the packaged directory exposes the bundled skill tree through the
 * native skill system without copying or installing anything into an OpenCode
 * configuration directory. Semantics:
 *
 * - append-only: any user- or project-configured skill paths are preserved;
 * - idempotent: registering the same directory twice is a no-op;
 * - optional: a missing packaged directory is skipped so a damaged install
 *   degrades to "no packaged skills" instead of failing the plugin load.
 *
 * @param config OpenCode configuration object mutated in place.
 * @param dir Skills directory to register; defaults to the packaged tree.
 */
export function applySkills(config: Config, dir: string = PACKAGED_SKILLS_DIR): void {
    if (!packagedSkillsDirExists(dir)) return;

    const skills = config as Config & { skills?: SkillsConfig };
    const paths = skills.skills?.paths ?? [];
    if (paths.includes(dir)) return;
    skills.skills = { ...skills.skills, paths: [...paths, dir] };
}
