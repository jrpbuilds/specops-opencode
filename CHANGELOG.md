# Changelog

All notable changes to SpecOps are documented in this file.

## [Unreleased]

### Changed

- Revised the OpenSpec compatibility policy to target the latest release and
  accept older versions whose capability probes still pass. (issue #10)
- Updated the OpenSpec compatibility target to 1.10.0 and removed the legacy
  version alias.

### Added

- Added `/specops-update`, so users can revise an active change in place without
  losing completed planning work. (issue #11)

## [v1.1.0] - 2026-08-21

### Added

- Added OpenSpec compatibility diagnostics and strict validation gates, so
  incompatible installs and malformed responses are caught early with
  actionable guidance. (issue #10)

## [v1.0.0] - 2026-08-20

### Added

- Added support for custom OpenSpec schemas, so planning follows each project's
  artifacts and structure instead of assuming the default layout. (issue #7)
- Improved workflow routing from live OpenSpec status, so skipped, blocked, and
  custom artifacts advance correctly. (issue #6)
- Added `specops_status`, so the coordinator can check the current change state
  without browsing project files. (issue #5)

### Fixed

- Fixed blocked read-only OpenSpec inspection, so the coordinator can fetch
  artifact instructions and inspect changes when needed.

## [v0.7.1] - 2026-08-17

### Fixed

- Fixed lost specialist handoffs, so completed work remains available after
  tool calls.
- Fixed delegation without an active change, so the coordinator establishes the
  current change before specialist work begins.
- Improved recovery from malformed task results by resuming the original task
  once instead of restarting the investigation.

## [v0.7.0] - 2026-08-16

### Changed

- Improved role permissions and workflow boundaries, so each agent has access to
  the tools and actions it needs without taking over another role's work.
- Improved headless operation for implementation and review while preserving
  safety prompts for interactive runs.
- Separated coordinator behavior by mode and Frontier settings, making each run
  use the appropriate workflow guidance.
- Improved planning checkpoints with clearer native questions and
  recommendations.

## [v0.6.0] - 2026-08-16

### Changed

- Restricted specialist agents to the SpecOps coordinators, preventing
  accidental workflow entry and unauthorized delegation.
- Added role-based permissions for lifecycle tools, keeping workflow ownership
  explicit and predictable.

## [v0.5.0] - 2026-08-15

### Fixed

- Fixed headless `/specops-auto` runs stalling on cross-directory commands.
  (issue #3)

## [v0.4.0] - 2026-08-14

### Added

- Added optional Engram memory support, so agents can use relevant project
  history without making memory a requirement.

### Changed

- Simplified onboarding: `/specops` now initializes OpenSpec automatically, while
  `/specops-onboard` remains available for explicit setup.
- Added optional Engram setup guidance and shared prompt policies for more
  consistent agent behavior.

## [v0.3.0] - 2026-08-13

### Added

- Added `/specops-auto` for headless workflows without interactive checkpoints.
- Added automatic OpenSpec onboarding for new projects.
- Added structured specialist handoffs and evidence-based review results.
- Added shared project context and focused review remediation for more reliable
  multi-agent workflows.

### Changed

- Ensured every `/specops` goal follows the full SpecOps workflow, including
  greenfield work.
- Updated the Galaxy Shooter example for the current workflow.

## [v0.2.0] - 2026-08-10

### Added

- Added optional Frontier guidance for difficult blockers while keeping final
  decisions with the Reviewer.

## [v0.1.0] - 2026-08-08

### Added

- Initial release of SpecOps for OpenCode with a spec-driven workflow and
  Coordinator, Explorer, Planner, Designer, Implementer, and Reviewer agents.
