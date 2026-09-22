---
name: specops-accessibility-review
description: Specialist accessibility review expertise for semantics, keyboard and focus behavior, labeling, form errors, and interactive state. Use when reviewing a change that exposes or alters a user interface.
license: MIT
metadata:
    author: specops
    role: specialist
---

# Accessibility review

Use this skill when the change exposes or alters a user interface. The consuming review lens decides which question matters; this skill supplies accessibility expertise for answering it. Do not treat every section as a mandatory checklist, and do not infer a user-interface concern when the change has no reachable UI surface. For a small bounded change, inspect the changed semantic contract, one keyboard path, and one observable accessibility oracle; expand only when the surface triggers a branch below.

## Establish relevance and the semantic surface

First identify the changed route, screen, component, form, or interactive primitive and its nearest existing analogue. Determine whether the change adds or alters:

- content that needs a programmatic relationship or meaningful reading order;
- a control, custom widget, dialog, menu, disclosure, or navigation state;
- validation, asynchronous status, or other information that changes after interaction;
- focus movement, DOM order, visual order, or keyboard order.

Use the repository's actual component primitives, naming conventions, test utilities, browser support policy, and declared conformance target. Conventions choose among accessible implementations; they do not excuse a regression in an applicable operability or conformance requirement. If approved intent conflicts with that requirement, surface the conflict rather than silently accepting either side.

## Route by the changed surface

Apply only the branches the change can reach:

- For layout, style, or overlay changes, inspect reflow, zoom, text spacing, contrast, content shown on hover or focus, and whether sticky content obscures the focused control.
- For pointer, gesture, or drag interactions, verify a non-drag single-pointer or keyboard path where required, cancellation before commit, and usable target size and spacing.
- For authentication or multi-step input, avoid cognitive-function tests unless an accepted alternative, assistance mechanism, or content exception applies; check paste and password-manager support, repeated-entry avoidance, discoverable help, and preservation of previously supplied information.
- For media, motion, flashing, or timed behavior, inspect alternatives and controls, reduced-motion behavior, safe flashing, timeout warning, and recovery of work.

## Challenge programmatic semantics

Inspect what assistive technology can discover and operate, not only what appears visually:

- Check that the native element or existing primitive exposes the intended role, accessible name, value, and state.
- For custom controls, trace keyboard operation, state changes, disabled behavior, focus visibility, and the relationship between the control and its content.
- Check that headings, landmarks, lists, tables, status messages, and reading order match the information hierarchy introduced by the change.
- Verify that visual hiding, conditional rendering, and responsive changes do not leave duplicate, missing, or contradictory content in the accessibility tree.

Prefer a native element or the repository's established accessible primitive. A custom implementation must reproduce the applicable native contract rather than only copying its appearance.

## Challenge keyboard and focus behavior

Follow a user through the changed interaction with only the keyboard:

1. Reach the changed control in a logical order and confirm that focus is visible.
2. Operate it using the keys the repository and platform convention require.
3. Observe focus when content opens, closes, loads, errors, or is replaced.
4. Return to a sensible focus destination after a dialog, menu, route transition, or failed submission.

Look for keyboard traps, invisible focus, focus loss on rerender, an order that differs from the visual or DOM order, and controls that can be reached but not operated. Check narrow layouts, zoom, long labels, and touch targets when those conditions affect the changed surface.

## Challenge labels and form errors

Trace every changed field from its label to its value, help text, validation state, and error recovery:

- A persistent visible label should be programmatically associated with the field.
- Help and error text should be associated with the field and remain available when the user needs to correct it.
- Error messages should identify the affected field, explain the action needed, and not rely only on color, position, or an icon.
- Server and validation errors should preserve the user's input and expose the changed state without moving focus unpredictably.

Placeholder text, hover content, and visual styling are not substitutes for an accessible name or an actionable error relationship.

## Challenge interactive state

For each reachable async or conditional state, identify the visible and programmatic result:

- loading and disabled states explain what is happening without making useful content disappear;
- success and failure states are discoverable without requiring a sighted user to notice a color or animation;
- dynamic content updates do not silently replace context or strand focus;
- reduced-motion and established announcement conventions are respected when the change adds movement or status feedback.

Do not require announcements for changes that are not relevant to the user's task, but do verify that meaningful status changes have a discoverable path.

## Verify with the right evidence

Use an evidence ladder and stop at the first level that can establish the claim. Code inspection and automated audits can establish detectable static rules. A real browser and keyboard pass are needed for focus movement, order, responsive layout, and native behavior. An accessibility-tree snapshot can establish exposed name, role, value, and state, but it does not prove that a live update is announced or that a complex widget works with an assistive technology. Use an actual screen reader or other relevant assistive technology for those claims, and record an evidence gap when the required layer is unavailable. User testing is the stronger oracle when the concern is practical usability rather than markup alone.

Build scenarios around the changed interaction and observe the accessible name, role, value, state, focus destination, error relationship, and recovery action. Treat an automated assertion as evidence for the behavior it directly exercises, not as proof that unrelated assistive-technology behavior works.

## Keep the review bounded

Approved OpenSpec artifacts, current repository behavior, and project conventions decide what the change should do. Report only material, evidence-supported accessibility concerns reachable through the assigned change; this skill does not expand the review into a general conformance audit.
