/**
 * Permission keys OpenCode defaults to `ask`. Setting each to `allow` on a
 * registered agent makes that agent behave as if `--auto` applied to it,
 * which is the gap upstream bug opencode#35073 leaves for spawned subagents.
 *
 * Keep this list in sync with OpenCode's `ask`-defaulting permission keys.
 * Today (opencode 1.18) that is `external_directory` and `doom_loop` only;
 * everything else defaults to `allow` and `.env` reads default to `deny`
 * (which `--auto` does not override either, so we don't touch them here).
 *
 * See https://github.com/jrpbuilds/specops-opencode/issues/3 and
 * https://github.com/anomalyco/opencode/issues/35073.
 */
export const SPECOPS_AUTO_REPLICATE_PERMISSION = {
    external_directory: "allow",
    doom_loop: "allow",
} as const;
