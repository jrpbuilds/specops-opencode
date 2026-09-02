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

| Decision                               | Where it lives                                                        |
| -------------------------------------- | --------------------------------------------------------------------- |
| Lifecycle, phase, and eligible actions | `src/openspec/status.ts`, `src/coordinator/workflow-state.ts`         |
| Artifact existence and dependencies    | `src/coordinator/artifact-graph.ts`                                   |
| Artifact eligibility, planning routes  | `src/coordinator/batching.ts`, `src/coordinator/rolling-scheduler.ts` |
| Task existence and completion          | `src/openspec/apply-instructions.ts`                                  |
| Assignment validity and overlap        | `src/coordinator/implementer-progress.ts`                             |
| Concurrency and capacity accounting    | `src/coordinator/rolling-scheduler.ts`                                |
| Review guard state                     | `src/coordinator/review-guard.ts`                                     |
| Archive eligibility                    | `src/openspec/archive.ts`                                             |
| Todo projection                        | `src/coordinator/todo-projection.ts`                                  |
| Progress projection                    | `src/tools/progress.ts`, `src/coordinator/review-fanout.ts`           |
| Role and tool permissions              | `src/agents/permission-policy.ts`, `src/host/lifecycle-permission.ts` |

Deterministic helpers may validate, derive, and project. Deterministic helpers must not judge.

One nuance keeps this classification honest: selecting the next eligible planning artifact to fill a free capacity slot is mechanics, because every artifact in the required closure must be authored regardless, and ordering by what unblocks the rest is derived from the declared dependency graph. Forming implementation lanes — which unchecked tasks to group, and how — is judgement, because the grouping itself is an engineering choice.

House style follows from the classification: deterministic projections are pure string-in/string-out functions, byte-identical for identical durable state, fail closed on invalid input, and contain no timestamps, randomness, or inferred state.

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

- Legal: archiving is _eligible_ because every task is complete and review passed.
- Recommended: whether to archive now, or which eligible work to dispatch first, is the coordinator's judgement.

A tool that returned "you should dispatch the implementer now" would cross the boundary even if the recommendation happened to be correct.

## Guardrails

Two rules bound every change to this contract:

> A deterministic helper may validate, derive or project known state. It must not encode engineering judgement merely because that judgement can be expressed as an algorithm.

> If TypeScript determines which valid engineering choice the Coordinator should make, rather than whether a choice is valid, the behaviour requires explicit architectural justification.

The second rule is an escape hatch, not a ban. Behaviour that steers judgement can be justified, but the justification must be explicit in the change's design artifacts, not implicit in the code.

## Projections are not state

Todo and progress reports are **non-authoritative projections**: they derive from durable state and can be rebuilt from it at any time. A projection may be lossy, ephemeral, or discarded when a coordinator run ends; it must never become a second source of truth.

OpenSpec remains the durable workflow source of truth. Change artifacts and task checkboxes under `openspec/changes/<change>/` are the only persisted workflow state; temporary session affinity, in-flight dispatch tracking, and projections end with the run.

## Classifying new behaviour

When adding or changing workflow behaviour, place it deliberately:

1. Does it have one objectively correct answer from durable state? → deterministic helper (TypeScript).
2. Does it require weighing usefulness, sufficiency, priority, or risk? → agent judgement (model, prompt guidance).
3. Is it a fact TypeScript can compute but only the model can act on? → hybrid: expose the fact, never the prescription.

If you find yourself writing TypeScript that picks _which_ valid engineering choice the Coordinator should make, stop: either move the choice back to the model, or write down the explicit architectural justification for making it deterministic.
