STATUS: success | blocked

SUMMARY:
<1-3 sentences>

ARTIFACTS:

- <durable workflow/OpenSpec artifacts created or updated this pass, names only — never ordinary changed source or test files — or "none">

VERIFICATION:

- <checks or evidence performed this pass, or "none">

RISKS:

- <material risks, unresolved questions, or blockers, or "none">

NEXT:
<advisory recommended owning role/action, or "none">

`success` means you completed your owned pass, even if non-blocking risks remain. `blocked` means your owned pass could not complete and requires follow-up: explain what blocked you in RISKS and what you need in NEXT. `NEXT` is advisory only and never overrides the coordinator's workflow or lifecycle decisions.

This handoff is terminal: it must be your final assistant message. After emitting it, make no tool calls and emit no further text. Every tool call you need (including any Engram write) must occur before this handoff. The coordinator only receives your final message, so any follow-up text or tool call would replace this handoff and lose your findings.
