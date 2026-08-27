# Model recommendations

Use the right model for each role instead of putting an expensive frontier model everywhere. SpecOps defaults to OpenCode's global model, so only map roles where a different choice helps.

## Quick guide

| Role           | What matters most                                   | Good options                                      |
| -------------- | --------------------------------------------------- | ------------------------------------------------- |
| Coordinator    | Reliable long-context instructions and tool routing | DeepSeek V4 Flash; Hy3 is a promising alternative |
| Explorer       | Fast, cheap repository reading                      | MiMo V2.5, DeepSeek V4 Flash, Muse Spark 1.2      |
| Planner        | Requirements judgement                              | DeepSeek V4 Pro, Qwen3.7 Plus, Kimi K3            |
| Designer       | Architecture and trade-offs                         | MiniMax M3, GLM 5.3, MiMo V2.5 Pro                |
| Implementer    | Long-horizon coding and tests                       | Kimi K2.7 Code, MiniMax M3                        |
| Review critics | Affordable independent code analysis                | DeepSeek V4 Flash, Hy3, GLM 5.3 Flash             |
| Reviewer       | Calibrated final PASS/FAIL judgement                | MiMo V2.5 Pro, DeepSeek V4 Pro, Kimi K3           |
| Frontier       | Rare difficult blockers                             | GPT-5.6 Sol                                       |

The Coordinator is not a trivial router: it carries a large, stateful workflow contract. Review critics run three times per round, so use different affordable model families rather than letting all three inherit the Reviewer.

## OpenCode Go or a provider?

[OpenCode Go](https://opencode.ai/docs/go/) is excellent for trying models and keeping high-multiplier options such as MiMo, DeepSeek Flash, Hy3, and MiniMax available cheaply. It is not an unlimited heavy-use plan; substantial planning, implementation, and repeated reviews can consume its limits quickly, especially with Kimi K3 or GLM 5.3.

For regular heavy use, move your busiest roles to a dedicated inference provider, coding package, or self-hosted endpoint. Keeping Go for cheaper roles alongside another provider is often the best-value setup. Always use the exact provider/model ID and variants shown by `opencode models`.

Muse Spark 1.2 Contributor is great for public-code exploration, but prompts and completions may be used for training. Do not use it for private source or confidential data.

## 1. Strong everyday open stack

The recommended private-work starting point. Sol is called only for rare Frontier escalation.

```json
{
    "frontierEscalation": true,
    "maxSubagentConcurrency": 3,
    "maxAutoReviewIterations": 1,
    "agents": {
        "specops-coordinator": { "model": "opencode-go/deepseek-v4-flash", "variant": "high" },
        "specops-explorer": { "model": "opencode-go/mimo-v2.5" },
        "specops-planner": { "model": "opencode-go/deepseek-v4-pro", "variant": "high" },
        "specops-designer": { "model": "opencode-go/minimax-m3", "variant": "thinking" },
        "specops-implementer": { "model": "opencode-go/kimi-k2.7-code" },
        "specops-reviewer": { "model": "opencode-go/mimo-v2.5-pro" },
        "specops-review-correctness": {
            "model": "opencode-go/deepseek-v4-flash",
            "variant": "high"
        },
        "specops-review-risk": { "model": "opencode-go/hy3", "variant": "high" },
        "specops-review-quality": { "model": "opencode-go/glm-5.3-flash", "variant": "high" },
        "specops-frontier": { "model": "openai/gpt-5.6-sol", "variant": "max" }
    }
}
```

Kimi K3 is a strong Planner or Reviewer upgrade, but it is too expensive in Go for a general default.

## 2. Public OSS sleeper stack

Uses Hy3 orchestration, Muse exploration, Qwen planning, GLM design, MiniMax implementation, and MiMo review.

```json
{
    "frontierEscalation": true,
    "maxSubagentConcurrency": 3,
    "maxAutoReviewIterations": 1,
    "agents": {
        "specops-coordinator": { "model": "opencode-go/hy3", "variant": "high" },
        "specops-explorer": {
            "model": "opencode-go/muse-spark-1.2-contributor",
            "variant": "medium"
        },
        "specops-planner": { "model": "opencode-go/qwen3.7-plus" },
        "specops-designer": { "model": "opencode-go/glm-5.3", "variant": "high" },
        "specops-implementer": { "model": "opencode-go/minimax-m3", "variant": "thinking" },
        "specops-reviewer": { "model": "opencode-go/mimo-v2.5-pro" },
        "specops-review-correctness": {
            "model": "opencode-go/deepseek-v4-flash",
            "variant": "high"
        },
        "specops-review-risk": { "model": "opencode-go/kimi-k2.6" },
        "specops-review-quality": { "model": "opencode-go/glm-5.3-flash", "variant": "high" },
        "specops-frontier": { "model": "openai/gpt-5.6-sol", "variant": "max" }
    }
}
```

For private work, replace Muse with `opencode-go/mimo-v2.5`.

## 3. Premium models everywhere

The intentionally expensive option for users with suitable provider plans or coding packages.

```json
{
    "frontierEscalation": true,
    "maxSubagentConcurrency": 3,
    "maxAutoReviewIterations": 3,
    "agents": {
        "specops-coordinator": { "model": "openai/gpt-5.6-luna", "variant": "high" },
        "specops-explorer": { "model": "openai/gpt-5.6-luna", "variant": "high" },
        "specops-planner": { "model": "opencode/claude-opus-5", "variant": "max" },
        "specops-designer": { "model": "openai/gpt-5.6-terra", "variant": "max" },
        "specops-implementer": { "model": "opencode/claude-sonnet-5", "variant": "max" },
        "specops-reviewer": { "model": "openai/gpt-5.6-sol", "variant": "max" },
        "specops-review-correctness": { "model": "openai/gpt-5.6-terra", "variant": "high" },
        "specops-review-risk": { "model": "opencode/claude-sonnet-5", "variant": "high" },
        "specops-review-quality": { "model": "openai/gpt-5.6-terra", "variant": "high" },
        "specops-frontier": { "model": "openai/gpt-5.6-sol", "variant": "max" }
    }
}
```

Concurrency changes speed, not total calls. Auto review iterations repeat all three critics and the final Reviewer, so keep the value at 1 until you trust your mapping.
