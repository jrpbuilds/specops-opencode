# Changelog

All notable changes to SpecOps are documented in this file.

## [v0.4.0]

### Added

- Optional read-only Engram integration: when Engram's MCP tools are available, the Explorer
  retrieves historical project memory (architectural rationale, conventions, gotchas, prior bug
  root causes), reconciles it against current repository evidence, and folds confirmed context
  into the existing PROJECT CONTEXT capsule. OpenSpec remains the sole durable source of truth;
  Engram is historical context, not authority, and repository evidence plus approved OpenSpec
  artifacts always override it.
- Explorer-owned retrieval contract with an explicit authority hierarchy and fail-open behaviour:
  Engram absence, errors, or ambiguous project identity never block `/specops` or `/specops-auto`.
- Stage 1 boundary: SpecOps performs no Engram writes or mutations; Planner, Designer,
  Implementer, and Reviewer may not call Engram tools themselves and receive reconciled
  historical context only through the Explorer's Project Context capsule.
- Non-blocking `Engram: <version> (optional)` line in `/specops-doctor`, reporting Engram binary
  availability without affecting any verdict or repair guidance.

### Changed

- README Getting Started no longer requires running `/specops-onboard` before `/specops`;
  `/specops` self-onboards and `/specops-onboard` is documented as an explicit/manual command.
- README documents Engram as optional/recommended with MCP-only setup as the Stage 1 baseline.

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
