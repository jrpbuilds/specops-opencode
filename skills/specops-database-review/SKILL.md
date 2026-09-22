---
name: specops-database-review
description: Specialist database review expertise for migration correctness, integrity constraints, transaction and locking behavior, query and index implications, existing data, and compatibility. Use when reviewing changes to persisted data, queries, or database-backed workflows.
license: MIT
metadata:
    author: specops
    role: specialist
---

# Database review

Use this skill when a change affects schema, migrations, persisted data, queries, transactions, locks, or database-backed workflows. The consuming review lens decides which question matters; this skill supplies database expertise for answering it. Follow the repository's migration tooling, supported database versions, transaction model, and deployment policy before applying generic database advice. For a small bounded change, trace the changed invariant, one conflicting interleaving or existing-data case, and one database-level oracle; expand only when migration, query, or recovery risk is material.

## Trace the data path

Follow the changed data from input or job entry through validation, query construction, transaction boundaries, writes, indexes, reads, serialization, and cleanup. Identify:

- the invariant the database must protect;
- which layer currently owns validation and normalization;
- the readers and writers that observe the changed shape;
- concurrent operations and background jobs that can interleave with it;
- the migration and rollback path used in real deployments.

Read actual queries and callers as well as schema declarations. An ORM type or migration definition does not reveal query plans, existing rows, lock duration, or mixed-version behavior by itself.

## Challenge migration correctness

Establish the actual database engine and version, approximate row count and write rate, exact lock or rewrite behavior, and deployment time budget. Accept a one-step migration only when those facts make its lock, runtime, compatibility, and recovery behavior safe; otherwise use the repository-supported subset of expand, bounded backfill, validation, cutover, and later contraction.

Inspect ordering, transactional behavior, and the state of data at each step. Check whether:

- an existing row can violate a new constraint, type, uniqueness rule, or nullability requirement;
- a default or backfill has the intended meaning for old and newly written rows;
- the migration can run safely with live readers and writers;
- an interrupted or partially applied migration has a defined recovery path;
- old application code can operate during the migration window when deployments are mixed;
- a rollback or forward-only policy is explicit rather than assumed.

Use representative existing data and the repository's actual migration runner where those are part of the contract.

Classify recovery separately: schema rollback, application rollback, and recovery of discarded or transformed data are different claims. A down migration that executes cannot restore lost information. Destructive work needs an approved irreversible outcome or demonstrated forward-recovery source, backup/restore path, or compatibility period.

For a material backfill, inspect bounded batch size, progress, restart and resume behavior, coexistence with concurrent writes, and invariant-specific reconciliation. Prefer source-to-target aggregates, key coverage, null or duplicate counts, transformation predicates, checksums, or equivalent database evidence over a row count or a few sentinel records.

## Challenge integrity and concurrency

Separate an application check from a database-enforced invariant. For each changed invariant, consider duplicate requests, concurrent writers, retries, deleted or stale records, and a process crash between related writes.

Inspect transaction isolation, lock scope, lock ordering, duration, deadlock handling, and the point at which a result becomes durable. A transaction boundary that looks correct locally may still leave an external effect, background job, or second writer outside the protected invariant.

## Challenge query and index implications

Determine whether the change alters query shape, cardinality, selectivity, ordering, joins, pagination, or the amount of data materialized. Look for:

- new unbounded scans or sorts;
- a predicate that prevents the intended index from being used;
- N+1 or repeated queries introduced by a loop;
- an index whose write, storage, or locking cost is material;
- result ordering or pagination that becomes unstable under concurrent writes;
- resource growth that has no bounded cleanup path.

Do not report a plan concern from a query string alone when a plan, representative data, or repository convention can resolve it. When parameter values materially change selectivity or plan choice, inspect representative extremes and estimate-versus-actual cardinality rather than one convenient example.

## Verify with database evidence

Use migration runs against representative data, constraint and concurrency tests, real transaction behavior, and query-plan inspection when the changed query is material. Assert durable state, absence of partial invalid state, lock or retry outcome, result shape and ordering, compatibility with existing rows, and cleanup of partial migration artifacts. Interrupt and resume backfills when resumability is claimed. Distinguish an executed database observation from an assumption based on an ORM abstraction.

## Keep the review bounded

Approved OpenSpec artifacts, current repository behavior, and project conventions decide which data guarantees apply. Report only material, evidence-supported database concerns reachable through the assigned change; do not turn the review into a general schema or capacity audit.
