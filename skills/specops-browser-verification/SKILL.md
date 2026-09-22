---
name: specops-browser-verification
description: Disciplined real-browser verification of browser-visible behavior, with explicit evidence gaps when browser tooling is unavailable. Use when a review needs to verify actual browser-visible behavior rather than infer it from code.
license: MIT
metadata:
    author: specops
    role: specialist
---

# Browser verification

Use this skill when a review needs evidence about behavior that only a real browser can observe reliably. The consuming review lens decides which question matters; this skill supplies a disciplined browser-verification method for answering it. It supplements code and test inspection rather than replacing either. For a small bounded change, run the narrowest scenario that reaches the change and proves its primary observable result; expand only when timing, history, layout, accessibility, or browser-engine behavior is material.

## Check capability before verification

First determine whether suitable browser tooling is available in the current environment. If it is unavailable, record an explicit **evidence gap** that names the missing capability and the browser-visible behavior that remains unverified. Do not simulate a browser session, infer that a check ran from source code, or describe an unexecuted observation as evidence.

The unavailable-capability path is itself part of the review record: distinguish a behavior that was inspected statically from one that was exercised in a real browser, and state what would need to be run to close the gap.

## Choose a narrow scenario

Derive a scenario from the changed behavior and its approved requirement:

1. Start from the user action or browser entry point that reaches the change.
2. Include the state transition, data boundary, navigation effect, and recovery path that could materially change the result.
3. Select the smallest viewport, input, timing, or history condition that makes the relevant behavior observable.
4. Avoid turning a focused review into an unbounded exploratory QA session.

Use existing repository fixtures, seed data, routes, authentication setup, and browser conventions. A scenario that cannot reach the changed code does not establish evidence about it.

## Establish a reproducible starting state

Begin from a known browser and data state. Use an isolated context where supported, control cookies, storage, authentication, clock, seed data, and feature flags that affect the scenario, and record any state intentionally preserved. Mock or stub uncontrolled third parties when needed for determinism, but do not replace the application boundary whose behavior the review is meant to verify.

## Observe the actual browser boundary

When tooling is available, exercise the scenario and record observations from the boundary the user or external system can see:

- rendered content, enabled actions, focus destination, and accessible state;
- navigation, refresh, back/forward, URL, and history effects;
- emitted requests, response shapes, console errors, and failed resource loads;
- layout at the affected breakpoint, long content, zoom, and touch conditions where relevant;
- native validation, browser-managed focus, or accessibility-tree behavior that component tests cannot establish.

Use screenshots, accessibility snapshots, network evidence, or console output only when they answer the review question. Keep the observation tied to the scenario and distinguish a captured fact from an inference.

For scripted verification, prefer locators based on user-facing roles, names, labels, and text. Use retrying assertions for the visible state, URL, or enabled action that proves the transition. For a transient request, popup, download, or navigation event, arm the listener before the triggering action and assert the captured result. Fixed sleeps, DOM implementation selectors, and immediate boolean checks create timing-dependent evidence rather than a reliable oracle.

## Challenge recovery and timing

For behavior involving asynchronous work, retries, navigation, or dynamic rendering, exercise the relevant ordering or failure path rather than only the first successful render. Check whether useful content and user input survive loading, an error, a retry, a refresh, a remount, or a second request when those transitions are part of the change.

Do not manufacture timing races that the implementation cannot reach. The scenario should expose a credible behavior boundary, not create noise unrelated to the approved change.

## Choose browser coverage proportionally

Use one representative supported browser when the behavior is application-owned and engine-independent. Expand to multiple supported engines or devices when the change touches CSS or layout primitives, native controls, browser APIs, history or navigation, input methods, accessibility behavior, or a known engine-specific defect. State the browser, version, viewport or device, starting state, relevant mocks, expected result, and actual result so another reviewer can reproduce the observation. Preserve a trace when a temporal failure cannot be explained from the final state alone.

## State the evidence boundary

For every browser scenario, record what was exercised, what was observed, what tooling and environment were used, and what remained outside the check. If a browser capability was unavailable, preserve the evidence gap instead of substituting a code-reading claim. Browser evidence supports the consuming review lens; it does not decide materiality or the final review outcome.

## Keep the review bounded

Approved OpenSpec artifacts, current repository behavior, and project conventions decide which browser behavior matters. Verify only material browser-visible claims reachable through the assigned change and disclose residual uncertainty rather than expanding the review into general compatibility testing.
