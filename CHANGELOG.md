# Changelog

All notable changes to SpecOps are documented in this file.

## [v1.7.0] - unreleased

### Added

- Review fan-out can cover multiple scoped jobs per lens while keeping parallel critics within the configured concurrency limit.
- Specialists now use relevant packaged skills when available, adding domain depth without changing their workflow responsibilities.
- Review work can now lean on focused domain skills for frontend, backend, security, database, accessibility, browser verification, compatibility, and performance concerns, so critiques gain depth without extra setup.
- SpecOps now ships focused frontend, backend, database, security, and testing skills, giving implementation work deeper domain guidance without extra setup.
- SpecOps now ships packaged skills that OpenCode discovers natively alongside your own skills, so added capability packs work without extra setup and nothing is installed into your OpenCode configuration.
- SpecOps now publishes the native to-do list itself from the current OpenSpec state instead of hand-maintaining it, with the sidebar as the only place the list appears; a failed status read keeps the last good list visible rather than clearing it.
- The to-do list shows in-flight parallel work where it belongs and removes each entry as that specialist finishes, and every entry carries a readable name and a short description so the checklist explains itself at a glance.
- `specops_status` now reports the change's current workflow phase, whether implementation and review are legally available (with a stable machine-readable reason when they are not), and every workflow action that is legal right now, so routing decisions start from durable facts instead of prose.
- Added a documentation contract explaining which parts of the workflow SpecOps decides for you and which stay a judgement call for the agents.

### Changed

- SpecOps' internal coordinator role is now named the orchestrator. Existing settings keep working: configurations that used the old `specops-coordinator` key migrate automatically with their model and variant choices preserved, and identical duplicate entries collapse; conflicting ones are reported with clear guidance instead of guessing.
- The to-do list now follows the whole run: it advances with the workflow phase, follows review through remediation and re-review to a fully checked-off archive, reads a background reviewer's verdict instead of missing it, and keeps its completed state through the archive step.
- To-do interaction is now a refresh trigger only: SpecOps rebuilds the canonical projection from current state on every call and coalesces refreshes to one per assistant turn, so the panel stays current across the run without duplicate updates or stale entries.
- Parallel progress is now tracked and reported by SpecOps from what actually happened in the session, alongside current task totals, and the progress tool is a read-only diagnostic, so the coordinator no longer maintains or submits that state.
- Workflow legality now comes from one shared derivation, so status, planning dispatch, and the to-do list can no longer contradict one another about the same change state.
- Specialist dispatches now name the active change on a line SpecOps checks before the specialist starts, and implementer assignments are validated when they are sent against concurrency, overlap, and current task state, so stale dispatches and invalid assignments fail fast with a clear error; whole-list dispatches are no longer rejected when an assignment field merely appears in task prose.
- Review now scales with the change in `auto` mode: small changes get a light single-reviewer pass, moderately complex or user-visible changes get a deeper single review with runtime checks where relevant, and broad or risky changes fan out only the critics whose lenses matter.
- Coordinator and specialist guidance is more concise and follows the current workflow state, with less duplicated prompt content while preserving the existing decision and safety boundaries.

## [v1.6.0] - 2026-09-02

### Added

- Added parallel implementation: when a change contains genuinely independent work, its tasks build simultaneously (bounded by the concurrent subagents setting), each implementer working only its assigned tasks. Related work stays grouped in one lane, work that unblocks the rest starts first, and parallel work pauses safely if tasks turn out to overlap — small or tightly related changes always stay on a single implementer.
- Parallel specialists now run as background tasks, so a finished specialist's slot is refilled immediately instead of waiting for the whole batch. Launch OpenCode with `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=true` for this behaviour; without it, parallel work still runs concurrently but refills in waves.
- Added parallel progress reporting, so a running workflow can show which review specialists and implementer dispatches are in flight or finished, including how each dispatch's assigned tasks compare against the checked task list. To-do lists reflect the same in-flight and completed work.
- Sequential assignments in the same implementation lane now reuse the same implementer session, preserving useful context while every dispatch still receives fresh task state; a fresh implementer dispatch remains an always-valid fallback.
- Agents can carry useful change context across sessions, making resumed work more consistent without requiring memory.
- Added Implementer fan-out and Review fan-out settings (both default `auto`) controlling when parallel implementation lanes and the three-critic review run.

### Changed

- Review now matches its effort to the change: small, simple changes are verified by the final Reviewer alone, while larger or riskier changes still run the three independent critics first. Set Review fan-out to `always` to keep critics on every change, or `never` to always review directly.

## [v1.5.0] - 2026-08-28

### Added

- Added independent correctness, risk, and quality reviews to catch more problems before a change is completed.
- Reviews now combine evidence-backed findings from three independent specialists before the final review decision.
- Added a review-window mutation guard: if repository or OpenSpec state changes during review, the run stops with the exact violations instead of passing a tampered review.
- SpecOps Auto can now retry failed reviews for a configurable number of correction cycles and reports the remaining findings when its budget is exhausted.
- Added a coordinator-only `specops_config` tool so coordinators can read the effective SpecOps settings without them being baked into prompts.
- Expanded the documentation into a full user guide covering setup, how it works, configuration, model choices, commands, and troubleshooting.
- Added archived-change validation to `/specops-doctor`, so stale archived specs surface during diagnostics.

### Changed

- Specialists now run one at a time by default; enable parallel subagents in Configure or `specops.json` when you want them to overlap.

- Coordinators now state their restricted tool boundary up front, so models route repository evidence and OpenSpec lifecycle work to the right tools on the first attempt instead of discovering the restriction through failed calls.
- Standard mode now routes review findings to the right correction path instead of always sending them straight to implementation.
- Planning now starts newly available work as soon as a slot opens, reducing unnecessary waiting.
- The Configure screen now offers subagent limits from 1 to 8 with less clutter.
- Review corrections now start at the earliest affected planning or implementation step, making complex fixes more reliable.
- Advanced users can set concurrency above 8 and Auto review iterations above 3 directly in `specops.json`; Configure continues to offer concurrency from 1 to 8 and Auto review iterations from 1 to 3.
- Shared coordinator rules (Explorer dispatch, planning batches, decision envelopes, review re-runs, and archiving) now live in one place, so Standard and Auto modes can no longer drift apart on how they follow them.
- Role display names, prompt assets, and review model fallbacks now share one source of truth, so catalogues can no longer drift when roles change.
- Fresh changes now report as planning-incomplete instead of failing validation while their first capability specifications are still being written, so new planning runs no longer stall on spurious "no deltas" errors.
- New changes can now begin planning before their first proposal exists, instead of stopping on an expected empty-change state.
- The review safety check keeps its temporary baseline inside the project's `.opencode` folder instead of adding a new folder to the repository root.

## [v1.4.0] - 2026-08-23

### Changed

- Loop detection no longer ends a `/specops` phase without warning. Interactive
  runs now pause and ask whether to continue; autonomous runs still stop right
  away rather than waiting for an answer that will never arrive.
- Explorer, planner, designer, and frontier subagents recover from repeated
  failed tool calls instead of abandoning their pass midway.
- Internal restructuring isolates the OpenCode integration behind a small
  adapter layer, keeping behaviour identical today while making future OpenCode
  2 compatibility work much smaller.

## [v1.3.0] - 2026-08-23

### Added

- Added configurable concurrent planning batches, so independent OpenSpec
  artifacts are authored in parallel (two at a time by default) while
  dependent work stays ordered.
- Added a Concurrent subagents option to SpecOps Configure, so the planning
  concurrency limit can be raised or lowered between 1 and 8 without editing
  config files by hand.

### Changed

- Clarified serial and concurrent planning routing, so batch dispatch stays
  predictable as workflows grow.

## [v1.2.0] - 2026-08-22

### Changed

- Revised compatibility checks to target the latest release while accepting older versions that still support the required features.
- Updated the OpenSpec compatibility target to 1.10.0 and removed the legacy
  version alias.

### Added

- Added `/specops-update`, so users can revise an active change without losing completed planning work.
- Added `/specops-sync`, so users can apply an active change's updates to the main specs without archiving it.
- Added workflow progress tracking, so users can follow work from exploration through planning, implementation, review, and completion.

## [v1.1.0] - 2026-08-21

### Added

- Added compatibility diagnostics and validation checks, so unsupported installs and malformed responses are caught early with actionable guidance.

## [v1.0.0] - 2026-08-20

### Added

- Added support for custom project workflows, so planning follows each project's structure instead of assuming a default layout.
- Improved workflow progress for skipped, blocked, and custom planning steps.
- Added `specops_status`, so the coordinator can check current change progress without browsing project files.

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
