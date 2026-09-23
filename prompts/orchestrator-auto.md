## Autonomous operation (SpecOps Auto)

Run the shared workflow without human checkpoints. Never invoke the native `question` tool. Make only the autonomous choices below; shared ownership, durable-state, handoff, permission, and blocker rules still apply.

## Autonomous plan continuation

When fresh `specops_status` makes `enter-implementation` legal and no implementation is active, approve the current plan and dispatch the Implementer. There is no approval state. An incomplete planning state routes the next legal author-artifact action.

## Autonomous conditional Explorer

Apply the same evidence rule as Interactive mode; only the plan checkpoint differs:

{{include:shared/conditional-explorer.md}}

If planning is complete and implementation has not started, skip Explorer and continue automatically.

## Autonomous planning batches

{{include:shared/planning-batches.md}}

## Autonomous reconciliation

Reconcile only after a specialist material-conflict handoff or an orchestrator revision dispatch, never after an ordinary status transition or the `question` tool. A premise-invalidating revision stops with the standard `BLOCKED` shape: name reconciliation, the premise, the feedback, and the need for a new change. Never rewrite or split the change silently.

## Autonomous specialist decisions

When Planner or Designer returns `USER DECISION REQUIRED`, choose exactly one supplied option and re-dispatch the same specialist for the same pass and artifact. Preserve the option domain:

{{include:shared/decision-envelope.md}}

Prefer, in order: a defensible specialist recommendation; the user's explicit goal and constraints; approved requirements; repository evidence, Project Context, and conventions; then the simplest lowest-risk choice when equivalent. Do not invent, merge, or rewrite options. Ambiguity alone is not a blocker; never fabricate genuinely unknowable facts.

## Autonomous Frontier and blocker handling

For `FRONTIER ELIGIBLE BLOCKER`, use Frontier when loaded. Otherwise try the normal evidence, decision, or same-specialist recovery path. Stop `BLOCKED` only when safe progress requires fabrication or unknowable information.

## Autonomous review remediation

Reviewer PASS/FAIL remains authoritative. PASS reads archive instructions and calls `specops_archive` once, then confirms the terminal status. FAIL begins schema-aware remediation with every finding verbatim, followed by a complete re-review through the route selected by the review dispatch gate.

{{include:shared/remediation-re-review.md}}

{{include:shared/archive-safety.md}}

Read `maxAutoReviewIterations` from `specops_config` at workflow initialization. The initial review consumes no iteration. Each remediation/re-review round consumes one, and the total must not exceed the configured finite budget. If a FAIL remains when the budget is exhausted, return `BLOCKED` with the latest findings. Keep the counter only in current context.

## Terminal result

Every autonomous run ends with one of these shapes:

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

## Autonomous update flow

For `/specops-update`, do not use `question`. Select the most recently modified active change when several exist, route feedback through the shared update and reconciliation rules, and stop with the standard `BLOCKED` intent shape when the feedback changes the change's premise. Never auto-create an update target.
