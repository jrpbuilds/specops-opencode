---
name: specops-database-engineering
description: Specialist database engineering guidance for schema changes, migrations, integrity, transactions, concurrency, and query behavior. Use when implementation changes persisted data, queries, or database-backed workflows.
license: MIT
metadata:
    author: specops
    role: specialist
---

# Database engineering

Use this skill when a change affects schema, migrations, queries, persisted state, or database-backed behavior. Start by learning the repository's migration tooling, supported database versions, deployment order, and data-access patterns.

Do not turn this skill into a demand for database work on every persistence change. First identify the invariant, data shape, migration, query-plan, compatibility, and concurrency risks that are material to the assignment.

## Establish the actual database context

Inspect evidence rather than assuming generic database behavior:

1. Find the authoritative schema, migration history, data-access layer, and the application paths that read and write the affected data.
2. Identify the supported engine and version, transactional-DDL behavior, deployment ordering, and whether old and new application versions overlap.
3. Inspect existing constraints, indexes, row counts, null and duplicate distribution, write rate, and representative query parameters where available.
4. Find the repository's conventions for backfills, long-running migrations, recovery, and production plan inspection.

Engine behavior matters. Null comparison, collation, isolation, DDL locking, online index support, defaults, and conflict handling are not portable assumptions.

## State the invariant or query contract

Write the fact that must remain true independently of implementation. Examples: "one active membership per user and workspace," "a balance cannot be spent twice," or "pagination returns a stable, non-duplicated order."

Choose the mechanism that matches the scope of the fact:

| Invariant | Typical enforcement |
| --- | --- |
| Required or row-local fact | `NOT NULL` or a check constraint |
| Identity across rows | Unique constraint or index |
| Reference must exist | Foreign key with deliberate update/delete behavior |
| Conditional single-write transition | Atomic statement with a guarded predicate |
| Detectable lost update | Existing optimistic version mechanism |
| Multi-row or cross-aggregate fact | Constraint, guard row, or transaction whose locking/isolation covers the complete conflicting predicate and write set |

Put an invariant in the database when every writer must obey it. Keep presentation concerns and request-context policy outside the schema. Application checks can improve errors, but durable constraints close races between writers.

Use parameters or the repository's safe query builder for values. Identifiers or query structure that cannot be parameterized require a strict allow-list; never turn untrusted text into executable query syntax.

## Classify migration risk before choosing a shape

Evaluate whether the change scans or rewrites data, takes a schema lock, changes storage size, tightens a constraint, depends on clean existing data, overlaps old application versions, or loses information. Then choose the smallest safe path:

- A single migration is suitable only when the supported engine, data size, and deployment assumptions make its lock and runtime acceptable.
- Otherwise select only the repository-supported stages needed for the identified risk: for example an online index build, split DDL, bounded validation, backfill, enforcement, application cutover, or later removal.
- Distinguish a default for future rows from correction of existing rows.
- Validate dirty or duplicate data before adding stricter constraints.
- Treat destructive changes as forward-recovery decisions. A down migration cannot restore data that has already been discarded.

For a substantial backfill, use the project's existing execution mechanism and make progress deterministic, bounded, resumable, and safe beside concurrent writes. Define how reruns identify completed work and how new writes receive the new invariant during the transition.

## Reason from the harmful concurrency interleaving

Do not select a lock or isolation level by habit. Write down the two operations, their read/write order, and the invalid result first. Then choose the least complex established mechanism that prevents it.

- Atomic conditional updates handle many check-then-write races.
- Unique constraints prevent duplicate creation across every writer.
- Optimistic versions detect lost updates when callers can retry or surface a conflict.
- Explicit locks or stronger isolation may be necessary for write skew and multi-row invariants; keep lock order consistent to limit deadlocks.
- Retry only database errors known to be safe, and retry the complete outer transaction rather than continuing from a partially failed one. The transaction body must itself be repeatable and must not contain unreconciled non-database effects.

Account for an unknown commit outcome: after connection loss, repeating a write may duplicate an effect unless the operation has a durable identity.

## Evaluate queries and indexes with evidence

Capture the actual query shape, joins, filters, ordering, pagination, parameter distribution, cardinality, and execution plan on representative data.

- Verify join multiplicity, null behavior, stable ordering, and query count before optimizing latency.
- Add an index for a demonstrated query or constraint, not because a filtered column looks indexable.
- Consider selectivity, column order, covered data, write amplification, storage, cache effects, and the lock/runtime required to build the index.
- Check representative parameter extremes; one fast plan does not prove all relevant distributions are safe.

## Verify on the real engine

When schema, transaction, or query semantics are the behavior, mocks cannot prove correctness. On the supported engine/version where practical:

- exercise clean creation and upgrade from representative existing data;
- reconcile the transformation with invariant-specific evidence such as key coverage, source-to-target aggregates, expected null/duplicate counts, transformation predicates, or checksums where appropriate; row counts and sentinel records alone are weak evidence;
- inspect resulting constraints, indexes, and representative query plans;
- force the material concurrent interleaving rather than relying on timing luck;
- interrupt and resume backfill or migration work designed to be resumable;
- prove the documented rollback or forward-recovery path;
- test violated constraints, invalid parameters, unstable pagination, duplicate work, deadlock/retry behavior, and old/new application overlap when applicable.

## Keep the assignment bounded

Approved OpenSpec artifacts, current behavior, and project conventions decide what to build. Apply this guidance only to concerns material to the assigned work; it does not authorize a schema rewrite, data cleanup campaign, or expanded scope.
