# Configuration

SpecOps has one configuration file: it maps each role to a model, plus a few workflow options. You can set it up in the visual editor or edit the file directly.

## The Configure screen

Open OpenCode's command palette with `Ctrl+P` and select:

```text
SpecOps Configure
```

The screen lists every role with its current model selection, plus three workflow options:

- **Frontier escalation** — on/off toggle
- **Concurrent subagents** — 1 to 8
- **Auto review iterations** — 1 to 3

Pick a role to choose its model and reasoning variant; pick an option to change its value. Save when done. If a saved model is no longer available in your current OpenCode catalogue, the editor flags it so you can repair it.

## Where configuration lives

```text
~/.config/opencode/specops.json
```

or `$XDG_CONFIG_HOME/opencode/specops.json` where that variable is set.

A complete example:

```json
{
    "frontierEscalation": true,
    "maxSubagentConcurrency": 3,
    "maxAutoReviewIterations": 1,
    "agents": {
        "specops-coordinator": {
            "model": "opencode-go/deepseek-v4-flash",
            "variant": "high"
        },
        "specops-explorer": {
            "model": "opencode-go/mimo-v2.5"
        },
        "specops-planner": {
            "model": "opencode-go/deepseek-v4-pro",
            "variant": "high"
        },
        "specops-designer": {
            "model": "opencode-go/minimax-m3",
            "variant": "thinking"
        },
        "specops-implementer": {
            "model": "opencode-go/kimi-k2.7-code"
        },
        "specops-reviewer": {
            "model": "opencode-go/mimo-v2.5-pro"
        },
        "specops-review-correctness": {
            "model": "opencode-go/deepseek-v4-flash",
            "variant": "high"
        },
        "specops-review-risk": {
            "model": "opencode-go/hy3",
            "variant": "high"
        },
        "specops-review-quality": {
            "model": "opencode-go/glm-5.3-flash",
            "variant": "high"
        },
        "specops-frontier": {
            "model": "openai/gpt-5.6-sol",
            "variant": "max"
        }
    }
}
```

Every key is optional. Leave a role out (or set no `model`) and that role inherits OpenCode's global default model.

## Configurable roles

| Role key                     | Purpose                                 |
| ---------------------------- | --------------------------------------- |
| `specops-coordinator`        | Orchestrates the whole workflow         |
| `specops-explorer`           | Repository investigation                |
| `specops-planner`            | Proposal, specifications, tasks         |
| `specops-designer`           | Technical design                        |
| `specops-implementer`        | Source code and tests                   |
| `specops-reviewer`           | Final independent PASS/FAIL verdict     |
| `specops-review-correctness` | Correctness critique                    |
| `specops-review-risk`        | Risk critique                           |
| `specops-review-quality`     | Quality critique                        |
| `specops-frontier`           | Escalation consultant for hard blockers |

**Review specialist inheritance:** if a review specialist has no model of its own, it inherits the Reviewer's model _and_ variant together. Give a specialist its own `model` to break away from the Reviewer — for example, run all three critics on a fast cheap model while the Reviewer uses a stronger one. A `variant` without a `model` is rejected.

## Workflow options

### `frontierEscalation` (default: `false`)

Registers the Frontier agent, a stronger escalation model consulted only when a blocker can't be resolved by normal routes. Changing this requires restarting OpenCode, because the agent is registered at startup.

### `maxSubagentConcurrency` (default: `1`)

The maximum number of SpecOps specialist subagents that may run at the same time.

- **Default is `1`:** specialists run strictly one at a time unless you raise this.
- The Configure screen offers **1–8**.
- You can set any positive integer directly in `specops.json`; values above 8 stay effective and show up in Configure as manual values.
- Work never exceeds this limit no matter how many routes are eligible. Raising it speeds up parallel stages like the review fan-out, at the cost of more concurrent model calls.
- **For the best experience, launch OpenCode with `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=true`.** With it, parallel specialists run as background tasks and a new one starts the moment any specialist finishes. Without it, work still parallelises but refills in waves — the next dispatch waits for every in-flight sibling to finish.

### `maxAutoReviewIterations` (default: `3`)

How many correction/re-review cycles SpecOps Auto may run after its initial review fails. One iteration covers routing findings to the earliest incorrect layer, correcting, and running the complete review pipeline again.

- The initial review doesn't consume an iteration.
- The Configure screen offers **1–3**; larger finite budgets are an explicit advanced choice made directly in `specops.json`.
- Manually configured values above 3 are preserved by Configure unless you explicitly change the setting.
- When the budget runs out without a PASS, Auto stops with a terminal `BLOCKED` report containing the latest findings — it never loops forever.

## Upgrading from older versions

Configuration files written before these fields existed are filled in automatically on load: missing concurrency becomes `1`, missing Auto iterations become `3`, and missing roles become empty entries. Nothing to migrate by hand.

## Related pages

- [Model recommendations](model-recommendations.md) — choosing which model classes to map where
- [Troubleshooting](troubleshooting.md) — invalid configuration and unavailable models
