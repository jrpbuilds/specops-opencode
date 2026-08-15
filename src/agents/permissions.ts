/**
 * The auto-approve permission applied to the `SpecOps Auto` coordinator and
 * the bash-heavy subagents it dispatches (`specops-implementer`,
 * `specops-reviewer`), so headless `/specops-auto` runs don't stall on
 * legitimate cross-directory or recovery actions. Sets the two OpenCode
 * permission keys that default to `ask` (`external_directory`, `doom_loop`)
 * to `allow`.
 *
 * The interactive `SpecOps` coordinator and the read-only specialists
 * (`specops-explorer`, `specops-planner`, `specops-designer`,
 * `specops-frontier`) opt out and keep OpenCode's default `ask`, so
 * interactive `/specops` still prompts before cross-directory access by
 * those agents.
 *
 * `specops-implementer` and `specops-reviewer` are shared with the
 * interactive coordinator, so interactive runs of those two also inherit
 * this auto-approval — an accepted side effect of the shared registration,
 * unavoidable without the upstream fix or a `permission.ask` hook.
 *
 * Residual risk: Auto's read-only specialists can still stall in headless if
 * they touch a cross-directory path, because `--auto` does not propagate to
 * subagent sessions (opencode#35073). Accepted tradeoff for the interactive
 * safety net.
 *
 * Keep this list in sync with OpenCode's `ask`-defaulting permission keys.
 * Today (opencode 1.18) that is `external_directory` and `doom_loop` only;
 * everything else defaults to `allow` and `.env` reads default to `deny`
 * (which `--auto` does not override either, so we don't touch them here).
 *
 * See https://github.com/jrpbuilds/specops-opencode/issues/3 and
 * https://github.com/anomalyco/opencode/issues/35073.
 */
export const SPECOPS_AUTO_PERMISSION = {
    external_directory: "allow",
    doom_loop: "allow",
} as const;
