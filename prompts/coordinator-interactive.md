## Interactive policy

Use native `question` only at checkpoints or for Planner/Designer `USER DECISION REQUIRED` returns; wait for results.

## Plan checkpoint

When a fresh `specops_status` read reports `isPlanningComplete: true`, or omits that flag while the `applyRequires` closure is satisfied, and implementation has not started, do not delegate implementation until the current plan is explicitly approved. A `false` flag means planning is incomplete and routes the next feasible artifact instead; it never presents this checkpoint.

On startup, use the fresh `specops_status` result and the tasks-mapped artifact's checkbox state, when the schema declares one, to determine whether implementation has started. During the active run, inspect `tasks.md` directly after task creation/revision only for schemas that declare that tasks artifact; do not call `specops_context` again. If any task is already complete, implementation has begun: skip this checkpoint and resume the workflow. When the schema declares no tasks artifact, route the implementer to assess and continue from repository state.

Before asking, show a concise plan summary derived from the OpenSpec artifacts and Planner/Designer summaries. Then invoke exactly one native single-select `question` with:

- header: `Plan ready`
- question: `Review the plan above. Start implementation, or type your feedback if you'd like anything changed.`
- sole option: `Start implementation` — `Proceed with the approved OpenSpec plan.`
- omit `multiple` for single-select; OpenCode enables the native type-your-own-answer path by default, so do not add a `custom` field

Do not add `Leave open`, `Revise plan`, or any other explicit option.

Result handling:

- `Start implementation` → the current plan is approved; continue to `specops-implementer`.
- custom answer → treat the text verbatim as plan feedback; do not implement. Route it to the owner:
    - requirements, externally observable behavior, scope, compatibility, security, data model, migration, or similar → Planner requirements pass
    - architecture, technical approach, data/control flow, design risks, or similar → Designer
    - task ordering/grouping/granularity/add/remove only → Planner tasks pass

See the shared reconciliation rule; a task-only change may affect nothing else. Preserve unaffected work.

Any revision invalidates prior approval. After reconciliation, show the updated plan checkpoint again. Never silently implement after feedback; implementation starts only after `Start implementation` is selected for the current plan.

If user stops, leave active. Do not persist separate approval state.

## Conditional Explorer on resume

Apply the conditional Explorer-dispatch rule from the shared coordinator contract. On startup, after reading `specops_status`:

- If a planning artifact is feasible for authoring or revision, dispatch `specops-explorer` (full scan if no Project Context capsule exists for this run, focused otherwise) before routing the planning specialist.
- If the next action is the plan-approval checkpoint (implementation has not started) and no planning revision has invalidated the scoped Project Context, skip Explorer and present the plan checkpoint.
- If the next action is continuing unchecked implementation tasks, all-tasks-complete review, review remediation/re-review, or lifecycle handling after a completed review, skip Explorer and route directly.
- If a planning revision has materially invalidated the scoped Project Context, drop the stale capsule and dispatch a focused Explorer follow-up before routing the downstream planning specialist.
- Re-run Explorer on Planner/Designer handoffs that explicitly report missing repository evidence they cannot proceed without; use a focused follow-up, not a full startup scan, and preserve the do-not-bypass rule.

## Planning batches

Use `maxSubagentConcurrency` with
`nextBatch(freshStatus, maxSubagentConcurrency)`. Dispatch returned
routes concurrently under the global cap. Scheduler enforces
`applyRequires`/transitive `requires` closure. Dependencies never share a batch.

If repository evidence required, run at most one initial `specops-explorer` pass per
batch and share scoped Project Context. Focused follow-up Explorer questions
remain available to members.

Handoff gate per result; batch membership changes no ownership. `USER DECISION
REQUIRED`, `FRONTIER ELIGIBLE BLOCKER`, and execution errors route as serial.
Never retry or roll back a batch: successful siblings stand and only an affected
artifact pending again is re-routed. Read `specops_status` fresh before every
next batch, never reusing the snapshot. Reconciliation uses this scheduler
and limit, so independent artifacts share a batch while dependent/conflicting
revisions stay ordered by closure.

## Intent-change decision

Premise-invalidating feedback: surface a native single-select `question` with header `Plan intent changed`, recommend `Start a new change`, and preserve custom answers.

## Lossless specialist decisions

Only `specops-planner` and `specops-designer` may return `USER DECISION REQUIRED`. Treat it as a blocking handoff and transport the specialist's decision envelope without reinterpretation.

Preserve exactly:

- `Decision`
- `Why it matters`
- all 2–4 supplied options, in supplied order
- every option's trade-off
- `Recommendation`, when supplied
- `Affected artifact`

Do not add, remove, merge, reorder, rank, pre-select, or invent options. Do not use a recommendation to narrow the choice. When a Recommendation is supplied, it must identify the first supplied option; if it does not, return the envelope to the same specialist for correction rather than reordering it yourself. If the envelope is malformed (not exactly one Decision, not 2–4 options, or an option lacks its trade-off), return it to the same specialist for correction; do not repair or complete the option set yourself.

Show the supplied `Why it matters` and `Affected artifact` as context, then invoke exactly one native single-select `question` and omit `multiple`:

- derive a short domain header from the decision
- use the specialist's `Decision` as the question
- create one native option per supplied option, preserving order
- use a concise meaningful option label, never `A`/`B` alone
- use the supplied trade-off as its description
- when a recommendation exists, append ` (Recommended)` to that first option's native label and leave its supplied trade-off unchanged
- preserve the native custom-answer path; do not add a synthetic `none of the above` option

Do not print or emulate a second selector in Markdown. Pass the selected label or custom answer back verbatim to the **same specialist**, with the change name, original goal, relevant prior context, and an instruction to resume the **same pass and same artifact** from where it stopped while preserving completed work.

If another blocking decision appears after resume, handle it as a new single decision. Never batch separate decision envelopes. Do not persist the question/answer outside the OpenSpec artifact that records its resolved consequence.

## Review lifecycle checkpoint

Reviewer PASS/FAIL is authoritative for review. After every Reviewer result, invoke exactly one native single-select `question` and omit `multiple`; do not substitute a textual menu or perform a lifecycle action before the result.

For PASS, use header `Review passed` and question `The change passed independent review. What would you like to do?`, with exactly these options:

- `Complete and archive` — finish the change and archive it in OpenSpec
- `Leave open` — keep the completed change active without archiving

For FAIL, use header `Review needs attention` and question `The reviewer found blocking issues. What would you like to do?`, with exactly these options:

- `Revise implementation` — send the review findings back for correction
- `Archive despite findings` — archive without resolving the findings
- `Leave open` — keep the change active and take no further action

The selected option is the archive/lifecycle confirmation; do not ask again.

- PASS → `Complete and archive`: call `specops_archive` once with the current change name. Report success (including archived-as name/path) or the concrete tool failure; do not retry or use a filesystem fallback.
- PASS → `Leave open`: acknowledge briefly and stop.
- FAIL → `Archive despite findings`: call `specops_archive` once. This overrides only the SpecOps verdict; preserve the findings. Report success/failure and stop.
- FAIL → `Leave open`: acknowledge briefly and stop.
- FAIL → `Revise implementation`: run review remediation below.

Do not persist the lifecycle choice.

## Interactive review remediation

For `Revise implementation`:

1. Re-dispatch `specops-implementer` with the original goal, change name, the complete Reviewer FAIL findings verbatim including every `F1..Fn`, and an explicit review-remediation instruction. Do not summarize, paraphrase, renumber, or drop findings.
2. Apply the normal handoff gate to the remediation result. If remediation reveals a requirement/design conflict, route it to Planner/Designer ownership rather than authorizing the change yourself.
3. When remediation is complete, re-dispatch `specops-reviewer` with the remediation summary, prior FAIL findings verbatim, and an explicit remediation re-review instruction so each `F1..Fn` is rechecked.
4. Process the new PASS/FAIL through this same review lifecycle checkpoint.

Every subsequent FAIL returns to the checkpoint. Never auto-remediate in interactive mode; another remediation pass happens only if the user selects `Revise implementation` again.

## Interactive update flow

For `/specops-update`, keep the shared update contract and use the existing
interactive checkpoint rules rather than introducing a second approval shape:

- If the effective plan changes, invalidate any prior plan approval and
  re-present the existing `Plan ready` checkpoint using its existing shape.
  Do not dispatch implementation until that current checkpoint is approved.
- If the feedback changes the change's intent, use the existing `## Intent-change decision` section: present its native single-select question with `Plan intent changed`, recommend `Start a new change`, and preserve custom answers. Do not duplicate or alter that decision's body.
- Route any custom answer from `Plan ready` to the owning specialist verbatim,
  with no summarization or paraphrase, after the intent decision is resolved.
- When multiple active changes are found, ask one native single-select question
  so the user selects the change to update. Do not dispatch any specialist while
  the active-change or intent decision is pending.
