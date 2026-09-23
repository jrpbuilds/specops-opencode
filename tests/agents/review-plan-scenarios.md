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

For every case, a concurrency limit of one changes only how many lanes can run simultaneously. Capability hints should be relevant and advisory. The Orchestrator should not use a file-count score, split a coherent concern for parallelism, or reduce material independent coverage merely to save calls.
