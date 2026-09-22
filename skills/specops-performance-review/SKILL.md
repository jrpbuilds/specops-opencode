---
name: specops-performance-review
description: Specialist performance review expertise for material hot-path, query, resource, latency, and unbounded-work concerns. Use when reviewing a change where performance is genuinely material to the behavior at hand.
license: MIT
metadata:
    author: specops
    role: specialist
---

# Performance review

Use this skill only when performance could materially change the behavior, cost, capacity, or user experience of the assigned change. The consuming review lens decides which question matters; this skill supplies performance expertise for answering it. Performance guidance is conditional: the existence of this skill does not make every change a performance review. For a small bounded change, identify the one resource or latency claim that could be material and compare it with one representative baseline; expand only when scale, concurrency, or retained state introduces another risk.

## Establish material relevance

Before investigating, identify a concrete reason performance is reachable:

- the change is on a hot request, render, job, query, or event path;
- user-visible latency, throughput, memory, storage, or resource limits can change;
- work scales with input, rows, tenants, events, retries, or time without a clear bound;
- a deployment or usage shape makes a previously acceptable cost material.

Skip speculative concerns when the changed path is bounded, infrequent, and outside the approved behavior. Do not substitute a style preference for an impact argument.

## Trace the work and its scaling shape

Follow the changed path from entry to completion and record work per request or item, serial and parallel boundaries, allocations, I/O, retries, cleanup, and retained state. Classify how cost changes with the relevant input or data volume:

- repeated work inside a loop or per-row/per-request N+1 behavior;
- a complexity-class change or newly unbounded collection;
- added serial network, database, or filesystem round trips;
- blocking work placed on an interactive or latency-sensitive path;
- queue, retry, cache, connection, or memory growth without bounded cleanup.

Compare with an existing analogous path and the repository's established batching, caching, pagination, pooling, and backpressure mechanisms.

## Challenge query and resource behavior

Inspect changed query shapes, predicates, joins, ordering, pagination, materialization, and index use where database work is material. Check resource acquisition and release, stream or buffer size, cancellation, timeout, retry multiplication, and shutdown behavior. A locally fast operation can still be unsafe if its work or retained state grows without a bound.

## Challenge latency and capacity effects

Identify whether new work is serial or can overlap safely, whether a dependency call occurs on a critical path, and whether concurrency increases pressure on a shared limit. Consider realistic empty, typical, large, and adversarial-but-reachable inputs. Do not invent production scale that the repository or approved change does not claim to support.

When the change affects a queue, pool, cache, subscription, or retained object graph, inspect saturation, backpressure, eviction or cleanup, and steady-state behavior. A short benchmark cannot expose unbounded growth or a leak that appears only after repeated work.

## Choose field or lab evidence deliberately

For browser-facing performance, field telemetry establishes real-user materiality; segment it by the product's supported device and traffic classes and inspect an appropriate distribution rather than an average alone. Controlled lab runs reproduce and diagnose a change before release. Do not substitute one for the other: lab proxies may not represent real interaction latency, and an initial-load run can miss post-load layout instability. Prefer repository service-level objectives and budgets over universal thresholds.

## Verify with measurements

Name the baseline or budget before claiming a regression. Compare before and after under controlled data volume, request shape, concurrency, cache state, build mode, and environment; repeat enough samples to expose noise and inspect the distribution appropriate to the claim, such as a median plus a tail percentile. Pair the metric delta with attribution from a profile, trace, query plan, operation count, allocation or resource measurement, or another oracle that explains why the change caused it.

If measurement is unavailable, state the evidence gap and limit the conclusion to what code, query plans, complexity, or repository contracts establish. Do not turn an unmeasured micro-difference into a material concern.

## Keep the review bounded

Approved OpenSpec artifacts, current repository behavior, and project conventions decide which performance guarantees apply. Report only material, evidence-supported performance concerns reachable through the assigned change; omit micro-optimisations and efficiency preferences without credible impact.
