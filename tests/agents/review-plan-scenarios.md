# Review-plan evaluation scenarios

Use these cases with the assembled Interactive and Auto Orchestrator prompts after implementation has passed validation. Present each change summary and ask the Orchestrator to choose a review plan before dispatch. Assess the selected shape, lane lenses/scopes, and explanation; do not require particular wording, IDs, or skill names. The final Reviewer must remain the sole verdict authority in every case.

## Direct

Evidence: A small, isolated documentation correction; no behavior, public contract, security, or data changes; relevant checks passed. `reviewFanout: auto`.

Expected: Final Reviewer alone. A specialist would add no material independent coverage.

## Focused

Evidence: One browser-visible form flow changed, with focused UI tests but no changed backend or data contract. `reviewFanout: auto`.

Expected: One or two relevant scoped lanes (for example, UI correctness) followed by the Final Reviewer. Browser verification remains relevant; unrelated risk or quality lanes need not be invented.

## Full gauntlet

Evidence: A new cross-layer workflow changes an API contract and failure handling; verification covers happy paths but not all failure boundaries. `reviewFanout: auto`.

Expected: At least one each of Correctness, Risk, and Quality, followed by the Final Reviewer. Explain the distinct value of each lens.

## Expanded

Evidence: Frontend and backend workflows both change; authentication and a database migration carry different risks; integration quality spans the layers. `reviewFanout: auto`.

Expected: More than three lanes with genuinely different scopes, such as separate frontend/backend Correctness and security/database Risk plus cross-cutting Quality, then the Final Reviewer. A second lane in one lens must inspect a materially different surface.

## Forced direct

Evidence: The expanded scenario with `reviewFanout: never`.

Expected: Final Reviewer alone despite the risk, with appropriate independent verification depth.

## Required gauntlet

Evidence: The isolated documentation scenario with `reviewFanout: always` and capacity above three.

Expected: At least one lane per Correctness, Risk, and Quality; no extra lane just to fill capacity or load every available review skill.

## Remediation re-review

For these cases, give the Orchestrator the prior Reviewer `F1..Fn` findings and correction targets verbatim, the prior review plan, and the remediation changes. Ask it to choose a new plan after correction. Prior lane IDs are round-scoped; the Final Reviewer must recheck every prior finding, the complete approved change, regressions, and new material defects regardless of the selected specialist lanes. In Auto mode, each correction/re-review still consumes one configured iteration.

### Narrowed to direct

Evidence: A prior focused review found a factual error in isolated documentation. The one-line correction has no runtime, contract, or data effect, and its relevant checks passed. `reviewFanout: auto`.

Expected: A direct Final Reviewer re-review is appropriate even though a specialist ran before. The Reviewer still verifies the prior finding and the complete approved change.

### Narrowed to focused

Evidence: A full frontend/backend/security review found an authentication service defect. The fix touches only the auth service and its tests; the frontend is unchanged and no frontend finding remains. `reviewFanout: auto`.

Expected: A focused backend/security plan covers the remaining material risk. The prior frontend lane is not required solely because it ran before. The Final Reviewer still checks the prior frontend behaviour and the canonical auth finding.

### New browser-visible surface

Evidence: A prior direct review found an incorrect planning requirement; the corrected requirement and implementation now alter an interactive form. `reviewFanout: auto`.

Expected: Add appropriate frontend correctness/browser coverage, even though no specialist ran in the earlier round. Keep the prior finding ID and correction target stable, and inspect the complete change for regressions.

### Resolved persistence concern

Evidence: A prior expanded review included a database risk lane. The persistence finding is resolved and the latest remediation only changes a service response with no persistence impact. `reviewFanout: auto`.

Expected: Do not retain the database lane solely because it ran before; recheck the resolved database finding and the service change. If current evidence instead leaves a persistence concern unresolved, retain adequate independent verification rather than using the smaller plan to evade it.

### Broad remediation

Evidence: Fixes span browser flow, authentication, schema migration, and integration behaviour after a prior focused review. `reviewFanout: auto`.

Expected: Choose the full gauntlet or expand to distinct scoped lanes when all these surfaces materially need independent coverage. Do not cap the new plan to the previous focused set or add lanes merely to consume capacity.

For every case, a concurrency limit of one changes only how many lanes can run simultaneously. Capability hints should be relevant and advisory. The Orchestrator should not use a file-count score, split a coherent concern for parallelism, or reduce material independent coverage merely to save calls.
