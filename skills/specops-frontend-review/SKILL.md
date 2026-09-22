---
name: specops-frontend-review
description: Specialist frontend review expertise for interaction and state behavior, forms, loading/error/empty states, client/server boundaries, frontend regressions, and meaningful UI verification. Use when reviewing changes that affect browser-visible behavior or client-side state.
license: MIT
metadata:
    author: specops
    role: specialist
---

# Frontend review

Use this skill when a change affects browser-visible behavior, client-side state, forms, or rendered data. The consuming review lens decides which question matters; this skill supplies frontend expertise for answering it. Start from the repository's component primitives, design system, routing conventions, data access, and test approach rather than applying a universal UI checklist. For a small bounded change, inspect the changed contract, nearest analogue, one credible failure path, and one observable oracle; expand only when a risk boundary below is reachable.

## Trace the changed interaction

Follow one analogous path through the repository before judging the change:

1. Find the route or entry point, rendered primitive, and component that owns the interaction.
2. Trace data from its authoritative source through loading, transformation, rendering, mutation, feedback, and cache update or invalidation.
3. Identify what survives rerender, remount, navigation, history traversal, refresh, and a second in-flight request.
4. Read the nearest tests to learn which behavior, semantics, and browser effects the project treats as contractual.

Read callers and data consumers as well as component types. A local render branch can appear correct while a parent, loader, cache, or navigation boundary changes its meaning.

## Challenge observable states

List only the states the changed feature can actually reach: initial, ready, empty, edited, validating, submitting, succeeded, failed, disabled, unavailable, stale, optimistic, and reconciled. For each relevant transition, inspect:

- visible content and status;
- enabled and disabled actions and the reason a user can understand;
- focus destination and announcement when content changes;
- navigation and history effect;
- preserved input and recovery action;
- behavior when an older response arrives after newer intent.

Loading should not erase useful content, an error should not discard recoverable input, and success should not leave controls or cached data ambiguous. Do not demand states that the implementation cannot reach.

## Challenge forms and asynchronous work

Trace normalization, client feedback, server validation, field errors, form errors, transport errors, duplicate submission, cancellation, retries, and reconciliation. Check that:

- the server remains authoritative for validation and authorization;
- server errors map to actionable fields or form-level feedback without losing edits;
- repeated activation does not duplicate a non-repeatable operation merely because a button is disabled;
- overlapping requests use the repository's established cancellation, serialization, stale-result rejection, or reconciliation pattern;
- optimistic state has both a rollback path and a defined response to a later refresh.

Characteristic defects include an older response overwriting newer intent, a loading branch unmounting recovery content, unstable list identity moving focus or local state, and URL-backed state breaking refresh or back/forward navigation.

## Challenge ownership and browser lifecycle

Trace each changed value to its authoritative owner. Duplicated server data, synchronized copies of derived state, and persistence whose lifetime exceeds its owner create drift that happy-path rendering can hide.

Whenever changed code acquires a listener, timer, observer, subscription, stream, or asynchronous operation, trace acquisition, replacement, cancellation, and cleanup through rerender, unmount, and navigation. Verify that only one intended registration remains active and that late work cannot mutate state after ownership ends.

For server-rendered or hydrated surfaces, compare server output with the client's initial state. Inspect hydration warnings, browser-only APIs reached before mount, duplicated effects or requests, and user input or focus replaced during hydration.

## Challenge the client/server boundary

Compare what the client assumes with what the server actually guarantees. Inspect omitted fields, defaults, error shapes, authorization outcomes, serialization, cache invalidation, and behavior after a refresh or direct navigation. Client validation is interaction feedback, not a trust boundary.

## Challenge regression surfaces

Check the changed behavior against an existing analogous path at the surrounding breakpoints, with long content, narrow width, zoom, repeated interaction, and translated or user-generated text when those conditions can affect the result. Preserve established DOM order, focus conventions, design-system primitives, and navigation behavior unless the approved change explicitly changes them.

## Verify with observable oracles

Build a small scenario table from the material state transitions. Assert rendered content, available action, accessible state, focus destination, navigation/history effect, emitted request, and recovery behavior. Use component tests for local rendering, integration checks for state/data composition, and a real browser for focus, history, layout, native validation, or accessibility-tree behavior. Resolve requests out of order and exercise invalid input or recovery when those paths are reachable.

## Keep the review bounded

Approved OpenSpec artifacts, current repository behavior, and project conventions decide which frontend guarantees apply. Report only material, evidence-supported frontend concerns reachable through the assigned change; do not expand a focused review into a redesign or general visual audit.
