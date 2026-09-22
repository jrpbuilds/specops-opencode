---
name: specops-backend-review
description: Specialist backend review expertise for API and service contracts, validation boundaries, side effects, failure and transaction behavior, integration behavior, and backend regressions. Use when reviewing changes to server behavior, integrations, or service contracts.
license: MIT
metadata:
    author: specops
    role: specialist
---

# Backend review

Use this skill when a change affects a service, API, worker, integration, or server-side contract. The consuming review lens decides which question matters; this skill supplies backend expertise for answering it. Start from the repository's request handling, error model, authorization conventions, transaction patterns, and observability practices rather than a generic service checklist. For a small bounded change, trace the changed boundary, one material failure path, and one observable oracle; expand only when effects, retries, concurrency, or compatibility make another path reachable.

## Trace the real execution path

Follow an analogous endpoint, message, job, or integration through the complete path:

1. Entry point, middleware, parsing, normalization, identity, and resource lookup.
2. Resource-level authorization, domain operation, transaction, and durable writes.
3. External effects, serialization or acknowledgement, error mapping, telemetry, and cleanup.
4. Alternate routes, workers, bulk operations, internal callers, and retries that reach the same operation.

Read actual callers and consumers as well as declared types. Types do not reveal omitted fields, retry behavior, ordering assumptions, or callers that rely on current failure behavior.

## Reconstruct the boundary contract

Record the accepted input, omitted and null semantics, defaults, normalization, output shape, ordering, status or error mapping, side effects, and ownership. Classify what changed for each consumer:

- **Additive:** existing valid inputs and meanings remain valid and new data is safely ignorable.
- **Behavior-changing:** the shape remains usable but defaults, timing, ordering, errors, or side effects change.
- **Breaking:** an accepted input, output, identifier, timing guarantee, or side-effect contract no longer holds.

Use the repository's compatibility policy and approved artifacts as the authority. Check that caller-facing errors are deliberate and stable without exposing stack traces, internal identifiers, credentials, or sensitive payloads.

## Challenge validation and authority boundaries

Determine where each invariant is actually enforced:

- syntax, shape, range, and cross-field meaning belong at the authoritative server boundary;
- identity and permission are separate decisions and must be checked against the actual resource, owner, tenant, and requested fields;
- alternate, bulk, worker, and internal paths must not bypass the same decision;
- caller-supplied ownership or authority claims are not trusted merely because they fit the request shape.

Check invalid, omitted, repeated, unauthorized, and partially valid inputs where they can change the externally observable result.

## Model effects and commit points

Write the effect sequence in order and mark the durable local commit, every externally visible effect, the response or acknowledgement point, and each crash, timeout, cancellation, or retry gap. For every gap, identify:

- the state a caller or operator can observe;
- whether a repeat can duplicate the effect;
- whether the operation can be reconciled, compensated, or safely retried;
- which repository mechanism owns recovery.

A transaction does not make a remote call atomic. Holding a database transaction across network work is exceptional. Prefer the repository's established idempotency, outbox, compensation, or reconciliation pattern over inventing a distributed protocol during review.

## Challenge retries, deadlines, and bulk semantics

When retry, timeout, fan-out, or cardinality changes, identify the layer that owns retry and the end-to-end deadline. Bound attempts and delay by that deadline, propagate cancellation where supported, and reject nested retry policies that multiply dependency calls or load. Verify the maximum dependency-call count, durable-effect count, queue growth, and concurrency for one logical operation, including an outcome that becomes unknown after a timeout.

For bulk work, determine whether validation, authorization, commit, response, and retry are all-or-nothing or explicit per item. An atomic contract must leave no committed subset after failure. A per-item contract must identify committed, rejected, and retryable items without replaying prior successes.

## Challenge concurrency and failure behavior

Identify the conflicting interleaving for concurrent requests and the narrowest existing constraint, version check, atomic write, or lock that protects the invariant. For workers, inspect acknowledgement timing, retryable versus terminal errors, poison-message handling, shutdown, and redelivery.

Inject or inspect material failures around durable commit, external effect, response or acknowledgement, serialization, cancellation, and unknown outcomes. Confirm that the externally visible response, durable state, effect count, repeat behavior, and diagnostic signal remain coherent. When observability is part of the changed boundary, verify a stable operation identity, dependency, outcome, latency, and retry count without protected payloads.

## Verify the full boundary

Use the layer that owns the risk. Real middleware, serialization, persistence, dependency adapters, and authorization boundaries are needed when their behavior is contractual; local decision logic can remain a unit-level concern. Treat a passing unit test as evidence for its assertion, not proof that integration ordering, error mapping, or callers behave correctly.

## Keep the review bounded

Approved OpenSpec artifacts, current repository behavior, and project conventions decide what the change should do. Report only material, evidence-supported backend concerns reachable through the assigned change; do not turn the review into an API redesign or infrastructure audit.
