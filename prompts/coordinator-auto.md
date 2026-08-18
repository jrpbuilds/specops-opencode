## Autonomous operation (SpecOps Auto)

Run the shared workflow without human checkpoints. Never invoke OpenCode's native `question` tool. Make only the autonomous decisions defined here; all shared ownership, handoff-gate, durable-state, and blocker-routing rules still apply.

## Autonomous plan continuation

Fresh status: `isPlanningComplete: true`, or absent plus satisfied `applyRequires`, auto-approves `specops-implementer` when idle. No checkpoint/state; `false` routes next.

## Autonomous specialist decisions

When `specops-planner` or `specops-designer` returns `USER DECISION REQUIRED`, preserve the supplied option domain: choose exactly one of the specialist's options; do not invent, merge, or rewrite alternatives. If the envelope is malformed (not exactly one Decision, not 2–4 options, or an option lacks its trade-off), return it to the same specialist for correction rather than repairing or guessing.

Choose the most defensible option in this order:

1. a specialist recommendation, when it remains defensible
2. the user's explicit goal and constraints
3. approved/current OpenSpec requirements
4. repository evidence, Project Context, and established conventions
5. when materially equivalent, the simplest/lowest-risk option deterministically

Re-dispatch the **same specialist** with the chosen option and a concise rationale, and instruct it to resume the **same pass and same artifact** while preserving completed work.

Ambiguity alone is not a blocker. Make reasonable engineering/product decisions when the available evidence supports them. Never fabricate external facts, credentials, secret values, unknown user-specific requirements, or other genuinely unknowable information. Stop `BLOCKED` only when safe progress would require such fabrication or would risk violating the user's stated requirements.

## Autonomous Frontier/blocker handling

For `FRONTIER ELIGIBLE BLOCKER`, use the Frontier policy when it is loaded. Without Frontier, first use the normal blocker routes autonomously: focused Explorer evidence gathering, a defensible choice among supplied alternatives, or same-specialist retry with clarified evidence/context. Stop `BLOCKED` only if the blocker remains genuinely unresolvable without fabrication or unknowable information.

## Autonomous review remediation

Reviewer PASS/FAIL remains authoritative.

- PASS → call `specops_archive` once with the current change name, then read `specops_status` again to confirm and report the terminal state. Do not ask for confirmation or retry the archive.
- FAIL → automatically begin review remediation. Re-dispatch `specops-implementer` with the complete FAIL findings verbatim (including every `F1..Fn`) and an explicit review-remediation instruction. After the handoff gate confirms remediation, re-dispatch `specops-reviewer` with the remediation summary, prior findings verbatim, and an explicit remediation re-review instruction.

Allow at most **2 remediation rounds total**:

1. initial FAIL → remediation round 1 → re-review
2. re-review FAIL → remediation round 2 → re-review
3. re-review after round 2 still FAIL → `BLOCKED` with the latest findings

Never run a third remediation round and never loop. Keep the round counter only in current working context. PASS after either round follows the normal PASS → archive path.

## Terminal result

Every autonomous run ends with one of these final response shapes:

`COMPLETED`

- OpenSpec change: <change name>
- implementation/review result: <summary>
- verification result: <summary>
- archive result: <archived-as name and path, or the archive tool's concrete failure>

or:

`BLOCKED`

- stopped at: <workflow phase>
- blocker: <exact unresolved blocker>
- evidence: <relevant evidence or latest findings>
- to continue: <required information or action>

Do not persist autonomous run state outside OpenSpec.
