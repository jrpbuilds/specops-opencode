## Autonomous operation (SpecOps Auto)

Run the shared workflow without human checkpoints. Never invoke OpenCode's native `question` tool. Make only the autonomous decisions defined here; all shared ownership, handoff-gate, durable-state, and blocker-routing rules still apply.

## Autonomous plan continuation

Fresh status: `isPlanningComplete: true`, or absent plus satisfied `applyRequires`, auto-approves `specops-implementer` when idle. No checkpoint/state; `false` routes next.

## Autonomous conditional Explorer

Apply the same conditional Explorer-dispatch rule as the shared coordinator contract; autonomous mode does not change whether Explorer is dispatched, only the plan-approval checkpoint behavior. On startup, after reading `specops_status`:

{{include:shared/conditional-explorer.md}}

- If planning is complete and implementation has not started, skip Explorer and auto-approve the Implementer per `## Autonomous plan continuation`.

## Autonomous planning batches

{{include:shared/planning-batches.md}}

Resolve serial conditions by autonomous rules; resume fresh, no question.

## Autonomous reconciliation

Triggers are deterministic and revision-originated only: specialist material conflict/inconsistency handoff or coordinator `revisionTarget` dispatch. Never a status transition or the `question` tool. Apply the shared rule in `prompts/coordinator.md`.

Premise invalidation terminates in the existing `BLOCKED` shape: `stopped at` names reconciliation; `blocker` names the premise; `evidence` carries feedback; `to continue` recommends a new OpenSpec change. Never rewrite or split.

## Autonomous specialist decisions

When `specops-planner` or `specops-designer` returns `USER DECISION REQUIRED`, preserve the supplied option domain: choose exactly one of the specialist's options; do not invent, merge, or rewrite alternatives.

{{include:shared/decision-envelope.md}}

Choose the most defensible option in this order:

1. a specialist recommendation, when it remains defensible
2. the user's explicit goal and constraints
3. approved/current OpenSpec requirements
4. repository evidence, Project Context, and established conventions
5. when materially equivalent, the simplest/lowest-risk option deterministically

Re-dispatch that specialist with the chosen option and a concise rationale.

Ambiguity alone is not a blocker. Make reasonable engineering/product decisions when the available evidence supports them. Never fabricate external facts, credentials, secret values, unknown user-specific requirements, or other genuinely unknowable information. Stop `BLOCKED` only when safe progress would require such fabrication or would risk violating the user's stated requirements.

## Autonomous Frontier/blocker handling

For `FRONTIER ELIGIBLE BLOCKER`, use the Frontier policy when it is loaded. Without Frontier, first use the normal blocker routes autonomously: focused Explorer evidence gathering, a defensible choice among supplied alternatives, or same-specialist retry with clarified evidence/context. Stop `BLOCKED` only if the blocker remains genuinely unresolvable without fabrication or unknowable information.

## Autonomous review remediation

Reviewer PASS/FAIL remains authoritative.

- PASS → call `specops_archive` once per the shared archive-safety rule; read `specops_status` afterward to confirm/report terminal state; no confirmation/retry.
- FAIL → automatically begin remediation via shared `## Schema-aware remediation routing`, carrying every `F1..Fn` verbatim. Planner/Designer returns follow `## Autonomous specialist decisions`.

Each bounded round: root-cause-oriented remediation → fresh independent specialist critics → authoritative full re-review. One fix may address several findings, but each canonical finding remains independently verified; inspect the whole approved change for regressions.

{{include:shared/remediation-re-review.md}}

Shared archive-safety rule:

{{include:shared/archive-safety.md}}

Read `maxAutoReviewIterations` from `specops_config` at workflow init.
Allow at most **that many remediation rounds total**. The initial review does not consume an iteration. For each remaining iteration:

- Begin shared schema-aware remediation with every canonical finding, including planning reconciliation when a finding targets a planning artifact.
- After implementation, the shared re-review contract above resets review state, runs the complete fresh critic fan-out, and performs an authoritative full re-review.
- PASS at any review follows the normal PASS → archive path.

When a FAIL leaves no iterations remaining, return `BLOCKED` with the latest canonical findings. Never start remediation without a remaining iteration and never exceed the configured finite budget. Keep the round counter only in current working context.

## Terminal result

Every autonomous run ends with one of these final response shapes:

`COMPLETED`

- OpenSpec change: <change name>
- implementation/review result: <summary>
- verification result: <summary>
- archive result: <archived-as name and path, or the archive tool's concrete failure>

or:

`BLOCKED`

- stopped at: <workflow phase>
- blocker: <exact unresolved blocker>
- evidence: <relevant evidence or latest findings>
- to continue: <required information or action>

Do not persist autonomous run state outside OpenSpec.

## Todo projection (autonomous)

The shared Todo projection policy applies unchanged. Capability-absent degradation; include `Auto review remediation` and `Auto review re-review` stages, with full rebuild on every routing decision and non-authoritative enforcement inherited from the shared contract.

## Autonomous update flow

For `/specops-update`, continue the shared update contract without introducing
an interactive branch:

- Do not use the `question` tool. When multiple active changes are found, pick
  the most recently modified active change per OpenSpec defaults.
- After the targeted revision, continue via the existing `## Autonomous reconciliation` and `## Autonomous plan continuation` rules by anchor only; do not restate their bodies or create a second auto policy.
- If the feedback changes the change's intent, use the same `BLOCKED` terminal
  shape already produced by autonomous reconciliation: `stopped at` names
  reconciliation, `blocker` names the premise, `evidence` carries the
  feedback, and `to continue` recommends a new OpenSpec change. Do not
  dispatch a specialist while the intent decision is pending.
