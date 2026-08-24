## Autonomous operation (SpecOps Auto)

Run the shared workflow without human checkpoints. Never invoke OpenCode's native `question` tool. Make only the autonomous decisions defined here; all shared ownership, handoff-gate, durable-state, and blocker-routing rules still apply.

## Autonomous plan continuation

Fresh status: `isPlanningComplete: true`, or absent plus satisfied `applyRequires`, auto-approves `specops-implementer` when idle. No checkpoint/state; `false` routes next.

## Autonomous conditional Explorer

Apply the same conditional Explorer-dispatch rule as the shared coordinator contract; autonomous mode does not change whether Explorer is dispatched, only the plan-approval checkpoint behavior. On startup, after reading `specops_status`:

- If a planning artifact is feasible for authoring or revision, dispatch `specops-explorer` (full scan if no Project Context capsule exists for this run, focused otherwise) before routing the planning specialist.
- If planning is complete and implementation has not started, skip Explorer and auto-approve the Implementer per `## Autonomous plan continuation`.
- If the next action is continuing unchecked implementation tasks, all-tasks-complete review, review remediation/re-review, or lifecycle handling after a completed review, skip Explorer and route directly.
- If a planning revision has materially invalidated the scoped Project Context, drop the stale capsule and dispatch a focused Explorer follow-up before routing the downstream planning specialist.
- Re-run Explorer on Planner/Designer handoffs that explicitly report missing repository evidence they cannot proceed without; use a focused follow-up, not a full startup scan, and preserve the do-not-bypass rule.

## Autonomous planning batches

`maxSubagentConcurrency` is maximum number of concurrently active SpecOps specialist subagents.
`createRollingScheduler` dispatches concurrently under cap; dependencies never share dispatch.

Rolling refill starts a newly eligible route after any single completion; never
wait for an entire wave to drain. Completion: handoff gate, `complete`, fresh
`specops_status` (never reuse a snapshot), then `dispatch` free slots.

Siblings stand; reroute pending only; never retry/rollback. `USER DECISION REQUIRED`, reconciliation conflicts,
`FRONTIER ELIGIBLE BLOCKER` handling, and unrecoverable execution errors suspend
new dispatches without cancelling active siblings; siblings handoff. Resolve
serial conditions by autonomous rules; resume fresh, no question.

Empty `dispatch`: no free slot/suspension, not terminal blocker.
Reconciliation uses scheduler/limit: independent share; dependent/conflicting
stay ordered. At most one initial `specops-explorer` pass uses shared Project
Context; focused follow-ups.

## Autonomous reconciliation

Triggers are deterministic and revision-originated only: specialist material conflict/inconsistency handoff or coordinator `revisionTarget` dispatch. Never a status transition or the `question` tool. Apply the shared rule in `prompts/coordinator.md`.

Premise invalidation terminates in the existing `BLOCKED` shape: `stopped at` names reconciliation; `blocker` names the premise; `evidence` carries feedback; `to continue` recommends a new OpenSpec change. Never rewrite or split.

## Autonomous specialist decisions

When `specops-planner` or `specops-designer` returns `USER DECISION REQUIRED`, preserve the supplied option domain: choose exactly one of the specialist's options; do not invent, merge, or rewrite alternatives. If the envelope is malformed (not exactly one Decision, not 2–4 options, or an option lacks its trade-off), return it to the same specialist for correction rather than repairing or guessing.

Choose the most defensible option in this order:

1. a specialist recommendation, when it remains defensible
2. the user's explicit goal and constraints
3. approved/current OpenSpec requirements
4. repository evidence, Project Context, and established conventions
5. when materially equivalent, the simplest/lowest-risk option deterministically

Re-dispatch the **same specialist** with the chosen option and a concise rationale, and instruct it to resume the **same pass and same artifact** while preserving completed work.

Ambiguity alone is not a blocker. Make reasonable engineering/product decisions when the available evidence supports them. Never fabricate external facts, credentials, secret values, unknown user-specific requirements, or other genuinely unknowable information. Stop `BLOCKED` only when safe progress would require such fabrication or would risk violating the user's stated requirements.

## Autonomous Frontier/blocker handling

For `FRONTIER ELIGIBLE BLOCKER`, use the Frontier policy when it is loaded. Without Frontier, first use the normal blocker routes autonomously: focused Explorer evidence gathering, a defensible choice among supplied alternatives, or same-specialist retry with clarified evidence/context. Stop `BLOCKED` only if the blocker remains genuinely unresolvable without fabrication or unknowable information.

## Autonomous review remediation

Reviewer PASS/FAIL remains authoritative.

- PASS → call `specops_archive` once with the current change name, then read `specops_status` again to confirm and report the terminal state. Do not ask for confirmation or retry the archive.
- FAIL → automatically begin review remediation. Re-dispatch `specops-implementer` with the complete FAIL findings verbatim (including every `F1..Fn`) and an explicit review-remediation instruction. After the handoff gate confirms remediation, re-dispatch `specops-reviewer` with the remediation summary, prior findings verbatim, and an explicit remediation re-review instruction.

Allow at most **2 remediation rounds total**:

1. initial FAIL → remediation round 1 → re-review
2. re-review FAIL → remediation round 2 → re-review
3. re-review after round 2 still FAIL → `BLOCKED` with the latest findings

Never run a third remediation round and never loop. Keep the round counter only in current working context. PASS after either round follows the normal PASS → archive path.

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

The shared Todo projection policy applies unchanged. Capability-absent degradation, full rebuild on every routing decision, and non-authoritative enforcement are all inherited from the shared contract.

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
