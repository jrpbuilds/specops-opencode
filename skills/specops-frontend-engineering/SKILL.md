---
name: specops-frontend-engineering
description: Specialist frontend engineering guidance for user-facing interaction, UX, state, forms, accessibility, responsive behavior, and safe rendering. Use when implementation work changes browser-visible behavior or client-side state.
license: MIT
metadata:
    author: specops
    role: specialist
---

# Frontend engineering

Use this skill when a change affects browser-visible behavior, client-side state, forms, or rendered data. Start from the repository's component primitives, design system, routing conventions, and test approach; they are more specific than generic frontend advice.

Do not treat every section as a mandatory checklist. First identify which interaction, state, accessibility, rendering, and browser risks are reachable in the assigned change, then apply the relevant guidance.

## Trace the existing interaction

Before editing, follow one analogous path through the repository:

1. Find the route or entry point, the rendered primitive, and the component that owns the interaction.
2. Trace data from its authoritative source through loading, transformation, rendering, mutation, user feedback, and any cache update or invalidation.
3. Identify what survives a rerender, remount, navigation, history traversal, refresh, and a second in-flight request.
4. Read the nearest tests to learn which behavior and accessibility semantics the project already treats as contractual.

Prefer an existing component, form, error, focus, and responsive pattern over a new abstraction. If no analogue exists, make the smallest local choice that fits the surrounding architecture.

## Model the observable states

Describe the interaction as user actions and observable states before choosing component structure. Include only states the feature can actually reach:

- initial, ready, empty, edited, validating, submitting, succeeded, and failed;
- disabled or unavailable states and the reason the user can understand;
- optimistic state and the rollback or reconciliation path;
- stale data retained during refresh versus data intentionally replaced.

For each transition, identify the visible result, enabled actions, focus destination, announcement where needed, navigation effect, and recovery action. Loading should not erase still-useful content, an error should not discard recoverable input, and success should not leave controls in an ambiguous state.

## Consider the user experience

Before implementing the interface, identify the user's goal, the primary action, the context needed to make a decision, and how the user understands success or recovers from failure.

- Check whether the flow adds avoidable steps, choices, repeated input, or surprise navigation.
- Keep status and next actions understandable; preserve useful input and context through validation, retries, and recoverable failures.
- Make empty and first-use states help the user proceed rather than only report that no data exists.
- Follow the repository's existing design system, visual language, content style, and interaction patterns. Considering UX does not authorize new aesthetic or style choices.

Use UX reasoning to improve the assigned behavior, not to broaden the work into a redesign.

## Choose state ownership deliberately

Classify each value before storing it:

| Kind of value | Default owner |
| --- | --- |
| Server-authoritative data | Existing query, loader, or data-access layer |
| Shareable navigation/filter state | URL when refresh, history, or links must preserve it |
| Cross-feature client state | Existing shared store only when independent consumers coordinate |
| Local interaction state | Narrowest component or form that owns its lifetime |
| Browser-persisted preference | Existing persistence mechanism with explicit read/write behavior |
| Value derivable from other state | Derive at use time rather than synchronizing another copy |

Lift state only when its lifetime exceeds the current owner or independent consumers must coordinate. Duplicated server or derived state creates drift; a global store is not a substitute for choosing an owner.

## Make forms and asynchronous work race-safe

- Decide when values are normalized and validated, and preserve the distinction between field errors, form errors, and transport or server failures.
- Map authoritative server errors back to actionable fields or form-level feedback without losing the user's edits.
- Define duplicate-submission behavior. Disabling a button can improve feedback but does not make a non-idempotent operation safe by itself.
- For overlapping requests, deliberately use the project's established form of cancellation, serialization, stale-result rejection, or reconciliation.
- If using optimistic updates, define both rollback and what happens when a later refresh disagrees with the optimistic result.

Common defects include an older response overwriting newer intent, a loading branch unmounting the content needed for recovery, unstable list identity moving focus or local state, and URL-backed state that breaks refresh or back/forward navigation.

## Preserve semantic and browser contracts

Use this order of preference for controls: native element, existing repository primitive, then a custom control. A custom control must reproduce the native contract that applies: accessible name, role, value or state, keyboard operation, disabled behavior, focus visibility, and focus restoration.

- Give fields persistent labels and associate validation help programmatically. Placeholder text, color, icons, or hover alone are not sufficient feedback.
- Keep DOM order, visual order, and keyboard order coherent. Dynamic changes should not unexpectedly reset focus or strand keyboard users.
- Check the project's actual breakpoints plus narrow width, zoom, long content, translated or user-generated text, error text, and touch targets where those conditions affect the changed surface.
- Respect reduced-motion and established motion conventions when adding movement; do not create a parallel animation system for a local change.

## Control rendering trust boundaries

Treat each interpreted output context separately:

- Render ordinary text through the framework's normal escaping path.
- Prefer structured APIs for URLs, attributes, styles, and DOM changes rather than building executable strings, then validate the scheme, origin, destination, and allowed value form for the context. Structured construction prevents syntax injection; it does not make an unsafe destination trustworthy.
- Use repository-approved sanitization only for intentionally permitted rich content; sanitization is not a replacement for context-appropriate safe APIs.
- Treat client validation as interaction feedback. The server remains authoritative for validation and authorization.

## Verify with observable oracles

Build a small scenario table from the material state transitions. Assert what a user or external boundary can observe: rendered content, available action, accessible state, focus destination, navigation/history effect, emitted request, and recovery behavior.

- Resolve two requests out of order when freshness handling is material.
- Cover invalid input, server field errors, retry, empty data, and preserved edits where those paths exist.
- Use a component test for local rendering decisions, integration coverage for state/data composition, and a real browser for focus, history, layout, native validation, or accessibility-tree behavior.
- Include hostile text or URL cases when the change introduces a rendering sink.

## Keep the assignment bounded

Approved OpenSpec artifacts, current behavior, and project conventions decide what to build. Apply this guidance only to concerns material to the assigned work; it does not authorize redesigns, new dependencies, or expanded scope.
