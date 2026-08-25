# Model recommendations

SpecOps's main idea is that each role should use the model best suited to its job — a cheap fast model for mechanical work, a strong reasoner where judgement matters. This page gives practical starting points. All roles default to OpenCode's global model, so you only need to map the roles where a different choice pays off.

## Matching model classes to roles

| Role                    | Job character                                               | Suggested class                                    |
| ----------------------- | ----------------------------------------------------------- | -------------------------------------------------- |
| Coordinator             | Deterministic routing and checkpointing; no specialist work | Fast, cheap, instruction-reliable                  |
| Explorer                | Repository scanning and evidence gathering                  | Fast, cheap, long-context                          |
| Planner                 | Requirements, specifications, task decomposition            | Strong reasoning                                   |
| Designer                | Technical design trade-offs                                 | Strong reasoning                                   |
| Implementer             | Code and test authoring                                     | Strong coding model; speed matters on large passes |
| Reviewer                | Final verdict authority                                     | The strongest reasoner you are willing to pay for  |
| Review specialists (×3) | Focused critiques run three-wide in parallel                | Cheap-to-mid tier — volume multiplies cost here    |
| Frontier (optional)     | Escalation consultant for hard blockers                     | Your strongest available model                     |

Two principles fall out of this table:

1. **Spend on judgement, save on volume.** The Planner, Designer, and Reviewer shape or judge the whole change — weak models here cause rework downstream. The review critics run three times per review, so a budget model there keeps the pipeline affordable without hurting the final verdict (the Reviewer still decides alone).
2. **The Coordinator does not need to be clever.** It routes and asks questions; it never writes code. A reliable cheap model is ideal.

## Example setups

### Budget

Fast and inexpensive everywhere except planning and the final verdict:

```json
{
    "agents": {
        "specops-coordinator": { "model": "opencode-go/deepseek-v4-flash", "variant": "high" },
        "specops-explorer": { "model": "opencode-go/deepseek-v4-flash" },
        "specops-planner": { "model": "openai/gpt-5.6-terra", "variant": "high" },
        "specops-designer": { "model": "openference/GLM-5.2", "variant": "high" },
        "specops-implementer": { "model": "openference/Kimi K2.7 Code", "variant": "thinking" },
        "specops-reviewer": { "model": "openference/DeepSeek-V4-Pro", "variant": "high" }
    }
}
```

Review specialists inherit the Reviewer's mapping, so all three critics ride the strong reviewer model too. For a cheaper pipeline, give them their own entries pointing at `opencode-go/deepseek-v4-flash`.

### Balanced

Strong models where they shape outcomes, mid-tier for volume critique:

```json
{
    "agents": {
        "specops-coordinator": { "model": "opencode-go/deepseek-v4-flash", "variant": "high" },
        "specops-explorer": { "model": "openference/Qwen3.7 Plus", "variant": "medium" },
        "specops-planner": { "model": "openai/gpt-5.6-terra", "variant": "high" },
        "specops-designer": { "model": "openference/GLM-5.2", "variant": "max" },
        "specops-implementer": { "model": "openference/Kimi K2.7 Code", "variant": "thinking" },
        "specops-reviewer": { "model": "openference/DeepSeek-V4-Pro", "variant": "high" },
        "specops-review-correctness": {
            "model": "opencode-go/deepseek-v4-flash",
            "variant": "high"
        },
        "specops-review-risk": { "model": "opencode-go/deepseek-v4-flash", "variant": "high" },
        "specops-review-quality": { "model": "opencode-go/deepseek-v4-flash", "variant": "high" }
    }
}
```

Mixing model _families_ between the critics and the Reviewer is deliberate: independent perspectives catch more than three copies of the same model thinking the same way.

### Maximum quality

Frontier escalation on, strongest models at every judgement point:

```json
{
    "frontierEscalation": true,
    "agents": {
        "specops-coordinator": { "model": "opencode-go/deepseek-v4-flash", "variant": "high" },
        "specops-planner": { "model": "openai/gpt-5.6-terra", "variant": "high" },
        "specops-designer": { "model": "openai/gpt-5.6-terra", "variant": "max" },
        "specops-implementer": { "model": "openference/Kimi K2.7 Code", "variant": "thinking" },
        "specops-reviewer": { "model": "openai/gpt-5.6-sol", "variant": "high" },
        "specops-frontier": { "model": "openai/gpt-5.6-sol", "variant": "high" }
    }
}
```

## Variants

Variants select a model's reasoning-effort mode (for example `low`, `medium`, `high`, `max`, or `thinking`), and every model exposes a different set. Rules of thumb:

- Planning, design, and review benefit from higher effort; the extra latency is small relative to the stage's importance.
- Exploration and coordination are fine at default or medium effort.
- A variant without a model is invalid; changing a role's model may reset an incompatible variant (the editor drops it rather than saving a broken pair).

## Tuning parallelism with cost in mind

[Concurrent subagents](configuration.md#maxsubagentconcurrency-default-1) defaults to **1** (serial). Raising it mainly speeds up stages that fan out — planning routes and especially the three-way review. If cost is the priority, stay at 1; if wall-clock time is the priority during reviews, 3 lets the critics run side by side. Auto's correction budget ([Auto review iterations](configuration.md#maxautoreviewiterations-default-3)) multiplies review cost on failing changes, so keep it low until you trust your mapping.
