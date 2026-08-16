# Changelog

All notable changes to SpecOps are documented in this file.

## [v0.7.0] - unreleased

### Changed

- Refactored built-in role capabilities into declarative data in
  `src/agents/permission-policy.ts`, while architectural security invariants
  (`task`, `question`, `specops_*`, `specops_lifecycle`, the private `specops-*`
  subagent boundary, and lifecycle ownership) remain enforced in
  `src/agents/permissions.ts` and `src/agents/boundary.ts`.
- `specops-implementer` and `specops-reviewer` now deny native external-directory
  access and retain `doom_loop: "allow"` for legitimate iteration and
  re-verification. Their unrestricted bash permission remains a residual
  capability for commands OpenCode does not detect; this is a native/tool-level
  guardrail, not an OS filesystem sandbox. The previous external-directory allow
  was a headless approval workaround, not a current workflow requirement.

## [v0.6.0] - 2026-08-16

### Changed

- The internal `specops-*` specialist agents are now private to the SpecOps
  workflow. Only the `SpecOps` and `SpecOps Auto` coordinators may dispatch
  them; other OpenCode agents can no longer invoke them (previously any primary
  agent could accidentally enter the SpecOps/OpenSpec workflow by dispatching,
  for example, `specops-planner`). This is enforced through OpenCode's
  `permission.task` glob rules at both the global and per-agent level rather
  than through prompt prose, and the specialists are additionally marked
  `hidden: true` so they no longer appear in the `@` autocomplete menu. The
  specialists also gain an explicit `task: "*" deny` so they cannot delegate to
  further subagents even if `subagent_depth` is raised. Existing user
  permission configuration is preserved and merged rather than replaced.
- SpecOps roles now use explicit role-based permissions. Coordinators can use
  native `specops_*` lifecycle tools and only `openspec --help` shell lookups;
  specialists receive headless-safe edit, shell, delegation, and lifecycle
  boundaries. Ordinary primary agents retain only the user-facing
  `specops_doctor` and `specops_onboard` lifecycle tools; context lookup, change
  creation, and archive remain Coordinator-owned. Custom lifecycle tools now
  perform an explicit runtime permission check before doing work.

## [v0.5.0] - 2026-08-15

### Fixed

- `/specops-auto` (and any headless run) could silently deadlock the first
  time a subagent made a `bash` call with a `workdir` outside `--dir`
  (smoke tests from `/tmp`, reading a global config, checking installed
  binaries, linting from a sibling checkout). None of the SpecOps agents set
  an explicit `external_directory` permission, so OpenCode's default `ask`
  applied — and `--auto` does not propagate to subagent sessions
  ([opencode#35073](https://github.com/anomalyco/opencode/issues/35073)),
  parent agent permissions don't propagate to subagents
  ([opencode#12566](https://github.com/anomalyco/opencode/issues/12566)), and
  session-inherited `external_directory` allows get clobbered on the way
  into the child session
  ([opencode#30527](https://github.com/anomalyco/opencode/issues/30527)). The
  `SpecOps Auto` coordinator and the bash-heavy subagents it dispatches
  (`specops-implementer`, `specops-reviewer`) now carry a shared
  `SPECOPS_AUTO_PERMISSION` that sets the two OpenCode permission keys that
  default to `ask` (`external_directory`, `doom_loop`) to `"allow"`, which is
  exactly what `--auto` would auto-approve. Because these are the agent's own
  registered rules (evaluated via `merge(taskAgent.permission, …)`), no `ask`
  is ever generated, short-circuiting all three upstream bugs. The
  interactive `SpecOps` coordinator and the read-only specialists
  (`specops-explorer`, `specops-planner`, `specops-designer`,
  `specops-frontier`) keep OpenCode's default `ask`, so interactive
  `/specops` still prompts before cross-directory access by those agents.
  Residual risk: Auto's read-only specialists can still stall in headless if
  they touch a cross-directory path (opencode#35073); accepted tradeoff for
  the interactive safety net. (issue #3)

## [v0.4.0] - 2026-08-14

### Added

- Optional Engram project-memory capability available to every SpecOps agent when Engram's MCP
  tools are present. Agents may use historical architectural decisions, conventions, previous
  discoveries, and project-specific gotchas selectively when they materially help their pass.
- One shared Engram policy across prompts: memory is contextual, not authority. Current explicit
  user instructions and the current approved OpenSpec artifacts govern the change; current
  repository and executed evidence govern what exists today; Engram memory yields whenever it
  conflicts with any of them. Engram absence or failure never blocks `/specops` or `/specops-auto`.
- SpecOps does not use Engram as an alternative store for OpenSpec change artifacts or workflow
  state. The previous global read-only restriction is removed so normal Engram memory behaviour
  can coexist with SpecOps.

### Changed

- README Getting Started no longer requires running `/specops-onboard` before `/specops`;
  `/specops` self-onboards and `/specops-onboard` is documented as an explicit/manual command.
- README documents Engram as an optional companion and recommends Engram's current documented
  OpenCode setup for exposing its MCP server and tools.
- Prompt contracts now compose shared fragments in `prompts/shared/` for the Engram policy, handoff
  envelope, Frontier blocker template, and Frontier advice line via a minimal whole-line
  `{{include:...}}` directive resolved when prompts load.

## [v0.3.0] - 2026-08-13

### Added

- `specops-auto` command and autonomous `SpecOps Auto` coordinator for headless runs: shares the
  standard coordinator prompt with an appended autonomous appendix and denies the `question`
  permission, executing the full workflow without human checkpoints and finishing with a terminal
  `COMPLETED` or `BLOCKED` report.
- Self-onboarding: every `/specops` run calls `specops_onboard` first, initialising OpenSpec
  automatically on fresh projects and terminating BLOCKED on unavailable or failed initialisation.
- Evidence-backed Reviewer compliance matrix: each independently verifiable approved behaviour is
  reported as `VERIFIED`, `COMPLIANT`, `UNPROVEN`, or `FAILING`, with executed evidence preferred
  where appropriate and manual/runtime verification accepted where no automated test is the right
  evidence.
- Standard specialist handoff envelope (`STATUS`, `SUMMARY`, `ARTIFACTS`, `VERIFICATION`, `RISKS`,
  `NEXT`) for specialist returns, with `USER DECISION REQUIRED`, `FRONTIER ELIGIBLE BLOCKER`, and
  Reviewer `PASS`/`FAIL` preserved as standalone returns.
- Explorer-generated `PROJECT CONTEXT` capsule, scoped to the current change and passed to
  Planner, Designer, Implementer, and Reviewer as orientation (never authoritative).
- Six review lenses inside the Reviewer — correctness/spec compliance, reliability,
  resilience/edge cases, security/risk, maintainability/readability, and regression risk —
  applied proportionally with findings flowing into the compliance matrix and `F1..Fn` contract.
- Delta-focused remediation re-review: after remediation the Reviewer re-checks each prior
  `F1..Fn` finding against the remediation delta, tagging `RESOLVED`, `UNRESOLVED`, or `REGRESSED`
  with stable finding IDs instead of re-critiquing the entire change.

### Changed

- Hardened the Coordinator workflow contract: every `/specops` goal now runs the full SpecOps
  workflow, including greenfield and self-contained deliverables, preventing the Coordinator from
  implementing goals directly.
- Regenerated the Galaxy Shooter example with the updated workflow and new model mapping.

## [v0.2.0] - 2026-08-10

### Added

- Optional `specops-frontier` consultation for genuinely difficult unresolved technical blockers,
  gated by `frontierEscalation` in `specops.json`. Frontier is advice-only, registered only when the
  capability is enabled, and preserves the Reviewer's sole ownership of the final PASS/FAIL verdict.

## [v0.1.0] - 2026-08-08

### Added

- Initial release of SpecOps for OpenCode: Coordinator, Explorer, Planner, Designer,
  Implementer, and Reviewer specialists with spec-driven OpenSpec workflow support.
