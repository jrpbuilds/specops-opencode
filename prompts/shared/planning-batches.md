Read `maxSubagentConcurrency` from `specops_config` at workflow initialization.
Use it as a strict cap, not a utilisation target. `specops_status` supplies the
currently eligible author-artifact actions; choose among them using dependency,
evidence, and quality judgement rather than treating the list as a prescription.

When independent planning passes genuinely benefit from concurrent context,
dispatch each specialist under the background dispatch contract. Dependencies
stay ordered, and each dispatch receives only its own artifact responsibility.

Rolling refill starts a newly eligible route after any single completion; never
wait for an entire wave to drain. Process the handoff gate, read fresh
`specops_status`, and refill only the freed capacity. Successful siblings stand;
reroute pending work only. A decision request, reconciliation conflict, Frontier
blocker, or unrecoverable execution error suspends new dispatches without
cancelling active siblings. Empty capacity is not itself a blocker.

Use at most one initial Explorer pass with the shared Project Context and use
focused follow-ups when a planning specialist reports missing evidence.
