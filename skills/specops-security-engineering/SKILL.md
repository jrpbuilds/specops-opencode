---
name: specops-security-engineering
description: Specialist security engineering guidance for trust boundaries, authentication, authorization, secrets, unsafe input, and secure failure. Use when implementation changes access, exposure, credentials, or handling of untrusted data.
license: MIT
metadata:
    author: specops
    role: specialist
---

# Security engineering

Use this skill when a change creates or alters a trust boundary, access decision, credential, externally supplied input, sensitive data flow, or privileged tool action. Scope security work to the actual change surface rather than applying a generic threat-model checklist.

Security work is proportional threat reduction, not automatic expansion into a broad audit. Use OWASP Top 10 as a coverage lens, ASVS-style requirements as verifiable properties, control-specific OWASP guidance for implementation, and adversarial test ideas only for risks reachable through this change.

## Build a change-scoped threat model

Before selecting controls:

1. Trace changed entry points, identities, trust boundaries, data flows, stores, interpreters, outbound calls, and privileged effects.
2. Name the protected asset and the relevant confidentiality, integrity, availability, privacy, or financial impact.
3. Form concrete abuse cases: actor, prerequisite, path, target, and effect.
4. Rank them by reachability, required attacker capability, impact, and controls already enforced at authoritative boundaries.
5. Select prevention at the boundary that owns the decision, then identify alternate paths that could bypass it.
6. Derive a verification obligation from each material abuse case and state any residual risk that the assignment cannot establish.

Avoid fictional enterprise threats unrelated to the changed surface. Conversely, do not dismiss a reachable path merely because its exploit needs an authenticated or low-privilege actor.

## Apply controls according to the trigger

| Change introduces or alters | Required reasoning |
| --- | --- |
| Access-controlled resource | Map subject, tenant, resource, action, ownership/attributes, and field visibility; cover object- and function-level access |
| Data reaching an interpreter | Prefer structured or parameterized APIs; validate syntax/meaning; encode for the specific output context; sanitize only intentionally allowed rich content |
| Session, token, or credential | Address issuance, transport, storage, expiry, rotation, revocation, replay, fixation, privilege changes, and CSRF for ambient credentials |
| URL fetch or redirect | Restrict destinations and schemes; account for parsing differences, redirects, DNS/address changes, and internal network reachability |
| File path, upload, or archive | Resolve and operate beneath the allowed root without a validation/use gap; account for symlinks; validate type/content and names; bound size, count, and decompression expansion |
| Cryptography or secret | Use repository-approved primitives and stores; address generation, access, rotation, revocation, and accidental disclosure; do not invent cryptography |
| Dependency or executable artifact | Distinguish version/lockfile pinning from digest or signature integrity; consider source provenance, executable install/build behavior, and existing vulnerability or policy checks |
| Exposure or security configuration | Check defaults, public access, CORS, debug behavior, security headers, storage/service permissions, and environment-specific overrides |
| Security-relevant event | Preserve attributable audit signals for access denial, privilege or credential changes, and sensitive operations using existing telemetry without exposing protected values |
| Exceptional or concurrent path | Preserve fail-closed behavior, bounded resource use, atomic privilege changes, retry safety, and absence of partial protected effects |
| LLM, agent, or retrieved content | Treat content as untrusted data; keep tool authority separate; validate tool arguments/results and resist direct or indirect prompt injection |

This table is a trigger map, not a universal checklist. Follow the repository's existing security mechanism where it satisfies the property. Avoid competing sources of truth for the same decision, while retaining independent controls that cover different failure modes.

## Enforce access at every meaningful path

Authentication establishes identity; authorization decides whether that identity may perform this action on this resource. Deny by default and make the resource and tenant relationship explicit.

- Check horizontal access (another user's resource), vertical access (a more privileged action), cross-tenant access, field-level exposure, bulk members, cached results, indirect identifiers, and alternate endpoints when material.
- Bind ownership and trusted attributes on the server. Do not accept caller-supplied role, tenant, price, approval, or ownership claims as authority.
- Decide what happens to active sessions and cached permissions after revocation or privilege change. Expiry alone may not satisfy an immediate revocation requirement.
- A denied or failed operation must leave no protected durable side effect.

## Keep defenses context-specific

Do not collapse all unsafe-input defenses into "sanitize input":

- Validation decides whether data is syntactically and semantically acceptable.
- Parameterized or structured APIs keep data separate from executable syntax.
- Output encoding is specific to the destination context.
- Sanitization removes dangerous constructs from rich content that is intentionally allowed; it is not a substitute for safe database, shell, URL, template, or DOM APIs.

Normalize or canonicalize when the receiving consumer's comparison and use semantics require it, then ensure validation and use refer to the same representation or safely opened object. Account for Unicode, URL, identifier, filesystem, symlink, and time-of-check/time-of-use behavior where relevant. Test encoded or alternate forms at the real parser/sink boundary. Apply size, rate, depth, timeout, and concurrency bounds where attacker-controlled work can exhaust resources or abuse an expensive business flow.

Keep tokens, credentials, keys, and sensitive values out of source, client-visible state, errors, telemetry, and build artifacts. Fail closed: malformed credentials, missing policy data, or unavailable security dependencies must not broaden access or silently report success.

## Verify adversarially

Turn each material abuse case into evidence at the boundary that owns the property. For access-controlled behavior, use a subject-resource-action matrix covering allowed and denied combinations rather than one unauthorized example.

Where relevant, verify:

- unauthenticated, wrong-role, wrong-owner, cross-tenant, field-level, bulk, and alternate-path access;
- expiry, revocation, replay, privilege change, and repeated operations;
- hostile and canonicalization variants reaching the real interpreter or parser;
- failure after partial work, concurrent attempts, and absence of durable effects when denied;
- caller-facing disclosure, log redaction, resource bounds, and existing secret, dependency, static-analysis, or configuration checks.

Use integration coverage for middleware, policy composition, parser differences, session behavior, and real sinks. Isolate pure policy decisions only when the integration wiring is verified elsewhere. If a security property cannot be tested or inspected within the assignment, name the residual uncertainty rather than claiming it is covered.

## Keep the assignment bounded

Approved OpenSpec artifacts, current behavior, and project conventions decide what to build. Apply this guidance only to risks material to the assigned work; it does not authorize a broad audit, platform migration, or expanded scope.
