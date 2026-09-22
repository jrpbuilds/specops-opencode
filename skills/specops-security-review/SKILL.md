---
name: specops-security-review
description: Specialist security review expertise for authentication and authorization, trust boundaries, secrets and exposure, unsafe input, injection classes, privilege changes, and security-sensitive failure paths. Use when reviewing changes that affect access, exposure, credentials, or handling of untrusted data.
license: MIT
metadata:
    author: specops
    role: specialist
---

# Security review

Use this skill when a change affects authentication, authorization, credentials, exposure, privilege, or untrusted data. The consuming review lens decides which question matters; this skill supplies security expertise for answering it. Do not apply it as a universal threat-modeling checklist: establish a reachable security boundary first. For a small bounded change, trace the changed asset or authority across one trust boundary, challenge one credible abuse path, and verify one protected outcome; expand only when another boundary is reachable.

## Establish material relevance

Start by identifying whether the change changes who can act, what data can cross a boundary, what a caller can supply, what becomes exposed, or how a denial or failure behaves. If none of those surfaces is reachable, record that the security concern is not material to this change rather than manufacturing a finding.

## Trace trust boundaries and data flow

Follow identities, permissions, user-controlled values, secrets, and derived authority from entry to the final sensitive operation. Mark where data crosses:

- network, process, tenant, user, privilege, or storage boundaries;
- parsers, serializers, templates, URLs, commands, queries, logs, or other interpreted contexts;
- client and server validation layers;
- error, telemetry, cache, export, and response paths.

Validate at the boundary that owns the decision. A value checked in one representation may become unsafe after decoding, normalization, concatenation, interpolation, or a context change.

## Challenge identity and authorization

Separate authentication from authorization and resource ownership. Check the requested action against the actual resource, tenant, owner, scope, and fields rather than trusting a route name, guessed identifier, or caller-supplied authority claim. Verify deny-by-default behavior and enforcement on every route, worker, bulk operation, internal caller, cache path, retry path, and static or exported resource that can reach the operation.

For a privilege change, describe the before-and-after reachable capability and the concrete resource or action an unauthorized caller could obtain. Do not call a permission change safe merely because the primary route has a check.

## Challenge sessions and credential lifecycle

When a session, token, reset link, API key, or credential changes, trace issuance, transport, client and server storage, binding, expiry, rotation, revocation, replay, fixation, and privilege-change invalidation. Check whether ambient credentials require request-forgery protection and whether an expired or revoked authority can continue through active sessions, refresh paths, caches, or background work.

Use observable negative cases: reject reuse of a one-time credential, reject an old credential after rotation or privilege loss, preserve no protected effect after failed re-authentication, and avoid exposing credentials through URLs, logs, errors, or browser storage outside the repository's contract.

## Challenge secrets and exposure

Inventory credentials, tokens, personal data, internal identifiers, and sensitive payloads across configuration, logs, exceptions, metrics, traces, serialized state, client bundles, URLs, caches, and caller-facing errors. Check retention, redaction, access scope, and accidental duplication at each changed boundary.

Prefer the repository's established secret and redaction mechanism. A value can be protected at rest yet exposed through a diagnostic path, an error string, a debug endpoint, or a browser-visible response.

## Challenge unsafe input and injection contexts

Classify each interpreted output separately. Check the repository-approved structured API, escaping, validation, allowlist, or sanitization mechanism for the actual context: database query, shell or process argument, template or HTML, URL, redirect, path, header, log, serialized document, or client-side code. Structured construction prevents syntax injection but does not make an unsafe destination or authority decision trustworthy.

Challenge syntactic and business-semantic invalidity, normalization differences, malformed or encoded values, boundaries, repetition, and mixed-context input where they can change the protected outcome. Prefer an allowlist for structured values and server-side enforcement for security decisions. Input validation reduces malformed data; it does not replace parameterization, context-appropriate encoding, or a safe structured API at the interpreter. Do not report an injection class that cannot reach an interpreter or sensitive sink in this change.

## Challenge attacker-controlled work

If caller-controlled size, nesting, compression, multiplicity, concurrency, regular-expression input, retries, or fan-out determine server work, identify the enforced bound and behavior at and beyond it. Check that rejection occurs before expensive allocation or side effects and that one caller cannot exhaust shared queues, connections, memory, storage, CPU, or downstream quotas.

When cryptography or transport security changes, verify repository-approved primitives and protocols, secure randomness or nonce use, key and certificate lifecycle, and failure behavior. Do not infer safety from a familiar algorithm name while ignoring how it is configured or where keys are exposed.

## Challenge security-sensitive failure paths

Inspect authentication expiry, authorization denial, validation failure, dependency timeout, partial work, cancellation, retry, and unknown outcomes. Determine whether failure is fail-closed where required, whether denied work leaves protected durable effects, whether retries duplicate privilege-sensitive actions, and whether errors disclose enough to aid an attacker.

## Challenge security telemetry

For changed access decisions, credential or privilege changes, sensitive operations, and suspicious validation failures, inspect the repository's required audit evidence. It should attribute the trusted actor, action, target, outcome, time or correlation identity, and useful reason without recording secrets or unnecessary personal data. Treat attacker-controlled log fields as untrusted: challenge delimiter or newline injection, oversized events, misleading identity fields, excessive volume, and logging failures that could either stop the application or erase the security signal.

## Verify reachability and impact

Prefer evidence that demonstrates a reachable boundary, changed capability, exposed value, unsafe sink, or materially different failure outcome. Use focused negative tests, real middleware, parser and serializer behavior, authorization integration, dependency failure injection, and log or response inspection where those layers own the risk. Unsupported suspicion belongs in residual uncertainty, not as a material finding.

## Keep the review bounded

Approved OpenSpec artifacts, current repository behavior, and project conventions decide which security guarantees apply. Report only material, evidence-supported security concerns reachable through the assigned change; do not expand the review into a general audit of unrelated controls.
