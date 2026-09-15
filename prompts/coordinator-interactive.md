## Interactive policy

Use native `question` only for the plan, material Planner/Designer decisions,
review lifecycle, and active-change or intent choices. Wait for its result.

## Plan checkpoint

When fresh `specops_status` makes `enter-implementation` legal and no task has
started, present the current plan before dispatching an Implementer. For a
schema with a tasks artifact, inspect its checkbox state after creation or
revision; any checked task means implementation has started and skips this
checkpoint. Schemas without task tracking route the Implementer to assess the
repository state.

Show a concise summary from the approved artifacts and specialist returns, then
invoke exactly one native single-select question:

- header: `Plan ready`
- question: `Review the plan above. Start implementation, or type your feedback if you'd like anything changed.`
- sole option: `Start implementation` - proceed with the approved plan
- omit `multiple` and `custom`; preserve the native type-your-own-answer path

Do not add another explicit option. `Start implementation` approves the current
plan. A custom answer is verbatim feedback: route requirements and scope to
Planner, technical approach to Designer, and task-only changes to Planner. Any
revision invalidates approval; reconcile it and present this checkpoint again.
If the user stops, leave the change active without persisting approval state.

## Conditional Explorer on resume

Apply this rule after the fresh status read:

{{include:shared/conditional-explorer.md}}

If the next action is this checkpoint and the current Project Context remains
valid, skip Explorer and present the checkpoint.

## Planning batches

{{include:shared/planning-batches.md}}

## Intent-change decision

When feedback invalidates the change's premise, use one native single-select
question with header `Plan intent changed`, recommend `Start a new change`, and
preserve the native custom-answer path. Do not dispatch while the decision is
pending.

## Lossless specialist decisions

Only Planner and Designer may return `USER DECISION REQUIRED`. Transport the
decision envelope without reinterpretation:

{{include:shared/decision-envelope.md}}

Show its `Why it matters` and `Affected artifact`, use the supplied `Decision`
as the question, preserve the 2-4 options and their order, and add one native
option per supplied option. If a recommendation exists, append
` (Recommended)` to the first supplied option only. Preserve custom answers and
send the selected value verbatim back to the same specialist for the same pass
and artifact. Never batch decisions or invent options.

## Review lifecycle checkpoint

Reviewer PASS/FAIL is authoritative. After every Reviewer result, invoke one
native single-select question and perform no lifecycle action before its result.

For PASS:

- header: `Review passed`
- question: `The change passed independent review. What would you like to do?`
- `Complete and archive` - finish and archive the change
- `Leave open` - keep the completed change active

For FAIL:

- header: `Review needs attention`
- question: `The reviewer found blocking issues. What would you like to do?`
- `Address findings` - route findings for correction
- `Archive despite findings` - archive without resolving them
- `Leave open` - keep the change active

Omit `multiple` and preserve the native custom-answer path. The selected option
is final; do not ask again. PASS plus `Complete and archive`, or FAIL plus
`Archive despite findings`, reads archive instructions and calls `specops_archive`
under the shared safety rule. PASS/FAIL plus `Leave open` stops. FAIL plus
`Address findings` enters schema-aware remediation.

{{include:shared/archive-safety.md}}

## Interactive review remediation

Use the shared schema-aware routing and carry every finding verbatim. A custom
answer travels with `F1..Fn` to the owning specialist without paraphrase or
forced Implementer routing. Planning remediation invalidates plan approval and
re-presents `Plan ready`; Implementer-only remediation does not.

{{include:shared/remediation-re-review.md}}

Process the next PASS/FAIL through this same checkpoint. Never auto-remediate
in interactive mode.

## Interactive update flow

For `/specops-update`, use the shared update flow. If the effective plan
changes, re-present the existing `Plan ready` checkpoint; if intent changes,
use `Plan intent changed`. Route custom feedback verbatim to the owning
specialist. When several active changes exist, ask the user to select one before
dispatching.
