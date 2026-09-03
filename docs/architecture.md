# The orchestration boundary

SpecOps gains its value by coordinating specialist agents around OpenSpec artifacts, not by scripting their every move. One rule governs every workflow and tooling change from v1.7 onward:

> **Make mechanics deterministic, not judgement.**

TypeScript validates, derives, and projects facts that have one objectively correct answer. Models keep the engineering and orchestration choices that require judgement. This document is the durable contract for that split, and every change to SpecOps tooling, prompts, or projections must preserve it.

The failure mode this guards against is hard-coding so much orchestration into TypeScript that the Coordinator becomes a puppet executing a workflow engine, unable to weigh evidence, trade-offs, or risk. Deterministic mechanics exist to remove prose, ambiguity, and repeated explanation from prompts — never to remove judgement from the agents.

## The three ownership groups

Every workflow decision belongs to exactly one of three groups.

### Deterministic state and legality — owned by TypeScript

A deterministic helper answers _what is true_, _what is legal_, and _what follows mechanically_ from durable state:

- current OpenSpec lifecycle and phase state;
- artifact existence and dependency satisfaction;
- artifact eligibility;
- task existence and completion state;
- assignment validity, uniqueness, and overlap;
- active concurrency and capacity accounting;
- review guard state;
- archive eligibility;
- Todo projection;
- progress projection;
- role and tool permission boundaries.

Today these live in:

| Decision                               | Where it lives                                                                                       |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Lifecycle, phase, and eligible actions | `src/openspec/status.ts`, `src/coordinator/workflow-state.ts`                                        |
| Planning completion                    | `src/coordinator/planning-completion.ts`                                                             |
| Artifact existence and dependencies    | `src/coordinator/artifact-graph.ts`                                                                  |
| Artifact eligibility, planning routes  | `src/coordinator/batching.ts`, `src/coordinator/rolling-scheduler.ts`                                |
| Task existence and completion          | `src/openspec/apply-instructions.ts`                                                                 |
| Assignment validity and overlap        | `src/coordinator/implementer-progress.ts`                                                            |
| Concurrency and capacity accounting    | `src/coordinator/rolling-scheduler.ts`                                                               |
| Review guard state                     | `src/coordinator/review-guard.ts`                                                                    |
| Archive operation (structural only)    | `src/openspec/archive.ts` — see the archive boundary below                                           |
| Todo projection and publication        | `src/coordinator/todo-projection.ts`, `src/coordinator/todo-publication.ts`, `src/host/todo-sync.ts` |
| Progress projection                    | `src/tools/progress.ts`, `src/coordinator/review-fanout.ts`                                          |
| Role and tool permissions              | `src/agents/permission-policy.ts`, `src/host/lifecycle-permission.ts`                                |

Deterministic helpers may validate, derive, and project. Deterministic helpers must not judge.

One nuance keeps this classification honest: selecting the next eligible planning artifact to fill a free capacity slot is mechanics, because every artifact in the required closure must be authored regardless, and ordering by what unblocks the rest is derived from the declared dependency graph. Forming implementation lanes — which unchecked tasks to group, and how — is judgement, because the grouping itself is an engineering choice.

### One canonical derivation per rule

Every lifecycle rule has exactly one deterministic home. Planning completion lives in `src/coordinator/planning-completion.ts`, and the status projection, the planning scheduler, and the Todo projection all consume that same verdict — none of them re-derive the answer from raw state. If a surface appears to answer a lifecycle question independently, it is drift: wire it to the canonical helper instead. This keeps the invariant simple — when `specops_status` reports an action as legal, the tool boundaries that enforce the same rule agree.

House style follows from the classification: deterministic projections are pure string-in/string-out functions, byte-identical for identical durable state, fail closed on invalid input, and contain no timestamps, randomness, or inferred state.

### The archive boundary

Archive is the one lifecycle gate SpecOps deliberately does **not** derive. OpenSpec exposes structural archive readiness and `specops_archive` performs the operation, but SpecOps policy also requires a passed review — and review results are not durable OpenSpec state. No canonical source can therefore prove every archive prerequisite. Archive legality is never emitted in `lifecycle` or `eligibleActions`, and structural readiness alone must never be labelled as archive permission; the passed-review-before-archive invariant stays minimal coordinator prompt guidance until durable review-result state is designed in a separately scoped change.

### Agent judgement — owned by the model

Judgement answers questions with no single correct answer — questions of usefulness, sufficiency, priority, and risk:

- whether repository exploration or further evidence is useful;
- whether existing evidence is sufficient to plan or implement;
- which eligible work is most useful to do first;
- whether implementation genuinely benefits from parallel execution;
- how tasks should be grouped into coherent implementation lanes;
- whether a change warrants broader review;
- architecture, implementation, and remediation choices;
- engineering and product trade-offs;
- whether a blocker is material enough to escalate.

Review breadth and risk weighting stay model-owned unless a future policy explicitly makes a specific rule deterministic. For example, critical-path priority when implementation lanes exceed concurrency is coordinator guidance — a judgement expressed in the prompt — not a TypeScript scheduler decision.

### Hybrid decisions — facts exposed, judgement applied

The hybrid pattern covers decisions where TypeScript can compute a fact, but only the model can decide what to do with it:

```json
{
    "uncheckedTasks": ["1.1", "1.2", "2.1"],
    "maxConcurrency": 2
}
```

The runtime may validate these facts and report them. It must not automatically decide that `1.1` and `1.2` form one implementation lane and `2.1` another, unless that grouping is itself a true invariant of the workflow. Exposing the fact is deterministic; interpreting it is judgement.

## Legal and eligible, never recommended or next

The sharpest test of the boundary: deterministic helpers report **legal and eligible** actions, never **recommended or next** actions.

- Legal: implementation is _eligible_ because every planning artifact is complete.
- Recommended: whether to start implementation now, or which eligible work to dispatch first, is the coordinator's judgement.

A tool that returned "you should dispatch the implementer now" would cross the boundary even if the recommendation happened to be correct. The archive boundary above sharpens the legal side too: a legality claim is only legal when a canonical source can actually prove it, which is why archive is withheld rather than guessed.

## Guardrails

Two rules bound every change to this contract:

> A deterministic helper may validate, derive or project known state. It must not encode engineering judgement merely because that judgement can be expressed as an algorithm.

> If TypeScript determines which valid engineering choice the Coordinator should make, rather than whether a choice is valid, the behaviour requires explicit architectural justification.

The second rule is an escape hatch, not a ban. Behaviour that steers judgement can be justified, but the justification must be explicit in the change's design artifacts, not implicit in the code.

## Projections are not state

Todo and progress reports are **non-authoritative projections**: they derive from durable state and can be rebuilt from it at any time. A projection may be lossy, ephemeral, or discarded when a coordinator run ends; it must never become a second source of truth.

OpenSpec remains the durable workflow source of truth. Change artifacts and task checkboxes under `openspec/changes/<change>/` are the only persisted workflow state; temporary session affinity, in-flight dispatch tracking, and projections end with the run.

### Todo publication

The native Todo list is runtime-published, not model-authored. Because OpenCode exposes no plugin write API for Todo state — the only writer is the builtin `todowrite` tool the model invokes — SpecOps intercepts that one tool through `tool.execute.before` and replaces the payload with the canonical projection derived from fresh durable state. Todo content is therefore runtime-owned; the model's call is only a flush trigger. The hook is session-scoped (only sessions that ran a SpecOps lifecycle tool are intercepted) and fails open by construction: any failure degrades to the model-authored list and never breaks the tool call, and Todo state is never read back as workflow authority. Presentation gaps — the Explorer evidence entry and ephemeral parallel entries — stay out of the projection until the runtime genuinely observes those dispatches, rather than implying required work from durable state alone.

## Classifying new behaviour

When adding or changing workflow behaviour, place it deliberately:

1. Does it have one objectively correct answer from durable state? → deterministic helper (TypeScript).
2. Does it require weighing usefulness, sufficiency, priority, or risk? → agent judgement (model, prompt guidance).
3. Is it a fact TypeScript can compute but only the model can act on? → hybrid: expose the fact, never the prescription.

If you find yourself writing TypeScript that picks _which_ valid engineering choice the Coordinator should make, stop: either move the choice back to the model, or write down the explicit architectural justification for making it deterministic.
