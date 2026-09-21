---
name: specops-testing
description: Specialist testing guidance for behavior-focused assertions, failure boundaries, integration choices, mocking risks, and regression protection. Use when implementation needs deeper verification design beyond the repository's usual test conventions.
license: MIT
metadata:
    author: specops
    role: specialist
---

# Testing

Use this skill when the implementation needs deliberate verification beyond a straightforward local unit test. Start from the repository's test conventions, existing coverage at the changed boundary, and the user-visible behavior the assignment must preserve.

Do not maximize test count or force every technique below onto the assignment. Identify the regression mechanism and choose the smallest set of tests that can actually detect it at the boundary where it occurs.

## Derive tests from the contract

Before choosing a test level or writing fixtures:

1. State the externally observable contract, invariant, or prior defect.
2. Name the regression mechanism: which wrong implementation could plausibly pass the happy path?
3. Identify the observer and oracle: output, error, durable state, emitted effect, accessible UI state, protocol message, or absence of an effect.
4. Partition the relevant input, actor, state, dependency, and timing space.
5. Select the lowest test level that still exercises the risky semantics.
6. Decide which dependencies must remain real and which can be controlled without invalidating the claim.

A useful regression test should fail for the defect it claims to protect and survive an internal refactor that preserves the behavior.

## Choose a case-design technique

| Situation | Useful technique |
| --- | --- |
| Ranged, optional, or structured input | Equivalence partitions plus values below, at, and above meaningful boundaries |
| Permissions, flags, or interacting conditions | Decision table covering materially different allowed and denied combinations |
| Multi-step workflow or lifecycle | State-transition cases, including invalid transitions, interruption, and repeated operations |
| Parser or large input domain | Property-based or fuzz testing when repository tooling supports it and the invariant is clear |
| Difficult direct oracle | Metamorphic relation, such as idempotence, round-trip, monotonicity, or order invariance where the contract guarantees it |
| Provider/consumer compatibility | Contract test shared with, or derived from, the real boundary |
| Retry, timeout, duplicate, or concurrency risk | Controlled clock/scheduler, barriers, failure injection, and assertions on partial or duplicate effects |
| Browser interaction | Real browser coverage for focus, history, native controls, and accessibility semantics; use viewport/geometric or visual oracles when layout fidelity is the claim |

Use pairwise or representative combinations when the full cross-product is unnecessary. Do not omit a combination whose interaction is itself the risk.

## Select the test boundary by what it can prove

- **Unit:** pure decisions, transformations, policy, and edge cases with no claim about wiring or infrastructure semantics.
- **Integration:** middleware, serialization, persistence, transactions, migrations, queues, dependency adapters, and composed authorization.
- **Browser:** real navigation, focus, browser APIs, native controls, accessibility semantics, or viewport behavior.
- **System/end-to-end:** a complete API, CLI, worker, queue, deployment, or cross-system path whose integration is the material risk; it need not involve a browser.

Use real infrastructure when its semantics are the claim. A mock database cannot prove transaction behavior; a stubbed middleware chain cannot prove route authorization; a shallow rendering cannot prove focus or browser history.

Mock only to control a slow, nondeterministic, unavailable, or irrelevant boundary. Keep the double faithful to the real contract, including documented errors, timeouts, partial results, and retry behavior. Prefer existing fakes, builders, and contract fixtures so doubles do not silently drift.

For a quantitative or environment-dependent contract such as latency, throughput, memory growth, visual fidelity, accessibility conformance, or supported-runtime compatibility, define the threshold and representative workload/environment before selecting the test. Use an oracle suited to the claim, account for warm-up and expected variance, and avoid turning noisy benchmark results into binary correctness tests unless the repository already has a stable performance gate.

## Assert outcomes and side effects

Assert the contract, not private helpers, incidental call order, or a snapshot whose meaning is unclear. For an operation with effects, verify both:

- the returned or visible outcome; and
- durable state and external effects, including their absence after denial or failure.

For security-sensitive behavior, turn the security property into a decision table or subject-resource-action matrix. Prove an allowed actor and similar denied actors, including ownership or tenant differences where material.

Characteristic failure cases include invalid and boundary input, empty state, dependency failure, partial work, cancellation, duplicate delivery, retry after an unknown result, stale data, and concurrent attempts. Include only reachable cases that could change the outcome.

## Keep asynchronous and concurrent tests deterministic

- Control time, randomness, generated identifiers, locale, timezone, and external state when they affect behavior.
- Avoid arbitrary sleeps. Control the scheduler or poll an observable condition with a bound and useful timeout diagnostic.
- Use barriers or explicit hooks to force the harmful interleaving instead of hoping thread timing reproduces it.
- Await all work, clean up resources, and avoid shared mutable fixtures that make tests order-dependent or unsafe under parallel execution.
- For eventually consistent behavior, assert the convergence condition and the allowed intermediate state, not an implementation-specific delay.

## Check test quality, not just test success

Before relying on a new test, ask:

- Would the plausible defect or original failure make this assertion fail?
- Is the oracle independent of the implementation, or does the test repeat the same logic and assumptions?
- Can it fail for an unrelated timing, data, environment, or cleanup reason?
- Does its failure explain the broken behavior and important inputs?
- Does it pass alone and with the relevant suite, including normal parallelism?

Run focused tests while iterating, then the repository-prescribed broader checks. Use repeated stress execution or mutation testing only when existing tooling and the material risk justify it. Never add tests solely to increase a coverage number.

## Keep the assignment bounded

Approved OpenSpec artifacts, current behavior, and project conventions decide what to verify. Apply this guidance only to risks material to the assigned work; it does not authorize unrelated test rewrites, new test infrastructure, or expanded scope.
