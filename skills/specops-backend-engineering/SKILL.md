---
name: specops-backend-engineering
description: Specialist backend engineering guidance for services, APIs, trust boundaries, side effects, compatibility, and observability. Use when implementation changes server behavior, integrations, or service contracts.
license: MIT
metadata:
    author: specops
    role: specialist
---

# Backend engineering

Use this skill when a change affects a service, API, worker, integration, or server-side contract. Learn the repository's request handling, error model, authorization conventions, and observability practices before choosing an implementation shape.

Do not apply this as a universal service checklist. Establish which contract, authority, compatibility, effect-ordering, concurrency, and dependency risks are reachable in the assigned change.

## Trace the real execution path

Before editing, follow an analogous endpoint, message, job, or integration through its complete path:

1. Entry point, middleware, parsing, normalization, authentication, and resource lookup.
2. Resource-level authorization, domain operation, transaction, and durable writes.
3. External effects, serialization or acknowledgement, error mapping, telemetry, and cleanup.
4. Alternate routes, workers, bulk operations, or internal callers that reach the same protected operation.

Read actual callers and consumers as well as declared types. Types do not reveal omitted fields, retries, ordering assumptions, or clients that depend on current failure behavior.

## Define the boundary contract

Record the accepted input, defaults and omitted/null semantics, normalization, output shape, ordering, status or error mapping, side effects, and ownership. Classify the proposed change:

- **Additive:** existing valid inputs and meanings remain valid; new data can be ignored safely by older consumers.
- **Behavior-changing:** the shape is compatible but defaults, ordering, timing, errors, or side effects change.
- **Breaking:** an accepted input, output, identifier, timing guarantee, or side effect contract no longer holds.

Preserve the repository's compatibility policy unless approved artifacts require otherwise. Return stable, deliberate failures and keep stack traces, internal identifiers, credentials, and sensitive payloads out of caller-facing errors.

## Enforce trust and authority at the resource

- Validate syntax, shape, range, and cross-field meaning at the authoritative server boundary. Client checks are feedback, not trust.
- Separate identity from permission. Authorize the requested action against the actual resource, owner, tenant, and requested fields, not just the route name.
- Check alternate and bulk paths consistently. For bulk work, decide whether authorization and failure are atomic per request or explicit per item.
- Bind trusted identity and ownership data server-side; do not accept authority claims merely because the caller supplied them.

## Model effects and commit points

Write the effect sequence in order and mark:

- the durable local commit;
- each externally visible effect;
- the response or acknowledgement point;
- every gap where a crash, timeout, cancellation, or retry can occur.

For each gap, determine the observable state and recovery behavior. A transaction does not make a remote call atomic, and holding a database transaction open across network work is exceptional. Use the repository's established transaction, outbox, idempotency, compensation, or reconciliation pattern rather than inventing a new distributed protocol.

## Decide idempotency, retry, and concurrency semantics

- Determine whether repeated delivery is expected and what identifies the same logical operation. Decide whether a repeat returns the original result, becomes a no-op, resumes work, or is rejected.
- Retry only when the failure is transient, the operation is safe to repeat, and another layer does not already own the retry. Bound attempts and delay by the caller's deadline, honor server-directed backoff where applicable, and avoid nested retries that multiply load. Validation, authorization, and deterministic conflicts do not become safe through retry.
- Account for an unknown outcome: a dependency may succeed after the local caller times out. Repeat only when duplicate effects are prevented or reconciled.
- Identify the conflicting interleaving for concurrent requests. Use existing atomic writes, constraints, version checks, or locking at the narrowest boundary that protects the invariant.
- For workers, acknowledge only after the repository's durable completion or handoff point. Distinguish retryable from terminal failures, bound or quarantine poison-message retries using the existing mechanism, and ensure shutdown leaves work either durably completed or safely redeliverable.

## Make failures diagnosable

Distinguish expected caller failures from operational faults. Within repository conventions, preserve a stable operation or correlation identifier across boundaries and record outcome, latency, dependency, and retry count when useful. Never log credentials, tokens, sensitive request bodies, or unnecessary personal data. A useful diagnostic signal explains which boundary failed without exposing protected values.

## Verify the full boundary

Exercise the layer that owns the risk. Real middleware, serialization, persistence, and dependency adapters are needed when their behavior is part of the contract; local decision logic can remain a unit test.

For material paths, inject failures at boundaries where the externally observable outcome can change, especially around durable commit, external effect, response or acknowledgement, and unknown-outcome windows. Assert:

- response or acknowledgement and stable error mapping;
- durable state and absence of partial unauthorized state;
- number and identity of external effects;
- repeat/retry outcome and concurrent-request behavior;
- diagnostic signal without sensitive disclosure.

Characteristic scenarios include duplicate delivery, timeout after remote acceptance, crash between write and publication, cancellation, partial bulk work, serialization failure, malformed input, and alternate authorization paths.

## Keep the assignment bounded

Approved OpenSpec artifacts, current behavior, and project conventions decide what to build. Apply this guidance only to concerns material to the assigned work; it does not authorize API redesigns, infrastructure changes, or expanded scope.
