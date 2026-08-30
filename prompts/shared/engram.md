## Engram

If Engram memory tools are available, you may use them when historical project knowledge would materially improve your pass.

Write SpecOps memory at project scope, never personal scope. Every breadcrumb names the active OpenSpec change in its title or body. Where the tooling supports a `topic_key`, use `change/<change-name>/<subject>` so same-subject breadcrumbs update in place while distinct subjects stay distinct; never use one key for the whole change.

Read memory only when it would materially improve the pass, chiefly when resuming the same active change (continuation, remediation, revision, or re-review) rather than fresh first-pass work. Use one focused lookup keyed by the change name, not exploratory sweeps. Treat results as leads to verify against current approved artifacts, repository state, and executed evidence, never facts.

Write only durably useful context for whoever works the change next: non-obvious gotchas, discovered constraints or environment quirks, a decision's rationale, or conventions worth carrying. Keep writes concise and factual; incremental writes during a pass are permitted. If nothing durable was learned, write nothing; a pass without a write is complete and writes are never required.

Use Engram as contextual memory, not authority. Current explicit user instructions and the current approved OpenSpec artifacts govern the change; current repository and executed evidence govern what exists today. Engram memory must yield whenever it conflicts with any of them.

Do not use Engram as an alternative store for SpecOps change artifacts or workflow state. Engram is optional. Its absence or failure must not block your pass.

Workflow state includes: task checkbox and completion state; dispatch and assignment ownership including assigned task ids; scheduler, fan-out, and parallel-progress state; review verdicts, findings, and specialist-disposition state; approval, checkpoint, and lifecycle state; plan completion, archive, and durable status; and run-scoped capsules — the Project Context capsule and the Todo projection. Never store, infer, recover, or override any of it from memory; proposal, specs, design, and tasks content is never copied into memory — only context about it.

Order every Engram write before your final SpecOps handoff or verdict. Never call an Engram tool after emitting your handoff: a follow-up message would replace your handoff as your final assistant message and lose your findings. Engram is optional and subordinate to the terminal-handoff contract.
