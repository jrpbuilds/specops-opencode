# Changelog

All notable changes to SpecOps are documented in this file.

## [v0.4.0]

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
