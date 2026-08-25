`maxSubagentConcurrency` is the maximum number of parallel SpecOps subagents; `createRollingScheduler` dispatches concurrently under cap, and dependencies never share dispatch.
Read its effective value from `specops_config` at workflow init and use it as the scheduler cap.

Rolling refill starts a newly eligible route after any single completion; never
wait for an entire wave to drain. Completion: handoff gate, `complete`, fresh
`specops_status` (never reuse a snapshot), then `dispatch` free slots.

Successful siblings stand; reroute pending only; never retry/rollback. `USER DECISION REQUIRED`, reconciliation conflicts,
`FRONTIER ELIGIBLE BLOCKER` handling, and unrecoverable execution errors suspend
new dispatches without cancelling active siblings; siblings handoff; resume
fresh durable state.

Empty `dispatch`: no free slot/suspension, not terminal blocker.
Reconciliation reuses the scheduler limit: independent routes share it;
dependent/conflicting ones stay ordered. At most one initial `specops-explorer`
pass uses shared Project Context; focused follow-ups.
