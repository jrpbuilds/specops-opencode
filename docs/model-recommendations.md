# Model recommendations

Pick the model that fits each job rather than putting an expensive frontier model everywhere. SpecOps deliberately restricts what each role can see and do, so a low-cost model is often a perfectly good choice when it's matched to the right task.

Use the matrix below to pick a starting point, then validate the mapping on the repositories and providers you actually use. Always choose the exact provider/model ID and reasoning variant available in OpenCode.

## Quick guide

| Role           | What matters most                                   | Good options                                                     |
| -------------- | --------------------------------------------------- | ---------------------------------------------------------------- |
| Coordinator    | Reliable long-context instructions and tool routing | Hy3; MiniMax M3; DeepSeek V4 Flash                               |
| Explorer       | Fast, cheap repository reading                      | Qwen3.7 Plus; DeepSeek V4 Flash; Muse Spark 1.2 Contributor      |
| Planner        | Requirements judgement                              | GPT-5.6 Terra; GLM 5.3; Kimi K3                                  |
| Designer       | Architecture and trade-offs                         | GPT-5.6 Terra; GLM 5.3; Kimi K3                                  |
| Implementer    | Long-horizon coding and tests                       | GPT-5.6 Luna; GLM 5.3 Flash; DeepSeek V4 Flash                   |
| Review critics | Affordable independent code analysis                | MiMo V2.5 Pro; Nemotron 3; Hy3; GLM 5.3 Flash; DeepSeek V4 Flash |
| Reviewer       | Calibrated final PASS/FAIL judgement                | DeepSeek V4 Pro; MiMo V2.5 Pro; MiniMax M3                       |
| Frontier       | Rare difficult blockers                             | GPT-5.6 Sol; Fable; Grok 4.6                                     |

## Choose for the role, not the leaderboard

The Coordinator is a great place to spend less. It follows a tightly defined workflow and routes work between constrained specialists; it doesn't need to be the strongest coding or architecture model in the stack. Hy3 is an excellent starting point because it's inexpensive and reliable at agentic tool calling. MiniMax M3 is a useful step up if you want a more capable controller.

The Explorer is mostly a reading job. Context window, retrieval discipline, speed, and cost usually matter more than code generation. Qwen3.7 Plus is a good low-cost default, and DeepSeek V4 Flash is another strong choice. Muse Spark 1.2 Contributor can be especially effective for public-source investigation. The joke writes itself: Meta get a capable model to explore code they may later learn from. Don't use it for private or confidential source.

Planning and design are where stronger reasoning pays for itself. The Planner turns requirements into a well-judged sequence of tasks; the Designer makes technical choices and weighs trade-offs. GLM 5.3, Kimi K3, and DeepSeek V4 Pro are all strong candidates. These roles are broadly interchangeable, so use the best frontier-class option you can afford, and preferably split Planner and Designer across different families — GLM 5.3 for planning and Kimi K3 for design, or the reverse.

For implementation, context capacity is a real practical constraint. Kimi K2.7 Code can produce excellent code, but may struggle on a large codebase once its context window becomes the limiting factor. GPT-5.6 Luna, GLM 5.3 Flash, DeepSeek V4 Flash, and MiniMax M3 are useful alternatives. Don't just pick the same model for every role either: a varied stack tends to surface more assumptions and failure modes.

The final Reviewer needs sound engineering judgement and a well-calibrated PASS/FAIL decision. DeepSeek V4 Pro and MiMo V2.5 Pro work particularly well here. Review critics have narrower, independent assignments, so capable flash models can be very effective: they need engineering judgement and issue-spotting ability, not necessarily full implementation prowess. Nemotron 3 is a good example of a model that may disappoint as a general coding assistant but works very well as a reviewer.

## Current configured stack

This is the only complete example in this guide. It uses low-cost models for routing and review work, reserves stronger models for planning, design, implementation, and escalation, and deliberately spreads the workflow across model families.

```json
{
    "agents": {
        "specops-coordinator": {
            "model": "opencode-go/hy3",
            "variant": "high"
        },
        "specops-explorer": {
            "model": "opencode-go/qwen3.7-plus"
        },
        "specops-planner": {
            "model": "openference/GLM-5.3",
            "variant": "max"
        },
        "specops-designer": {
            "model": "openference/Kimi K3",
            "variant": "high"
        },
        "specops-implementer": {
            "model": "openai/gpt-5.6-luna",
            "variant": "high"
        },
        "specops-reviewer": {
            "model": "openference/DeepSeek-V4-Pro-0813",
            "variant": "max"
        },
        "specops-review-correctness": {
            "model": "opencode-go/mimo-v2.5-pro"
        },
        "specops-review-risk": {
            "model": "opencode-go/muse-spark-1.2-contributor",
            "variant": "xhigh"
        },
        "specops-review-quality": {
            "model": "opencode-go/minimax-m3",
            "variant": "thinking"
        },
        "specops-frontier": {
            "model": "openai/gpt-5.6-sol",
            "variant": "high"
        }
    },
    "frontierEscalation": true,
    "maxSubagentConcurrency": 3,
    "maxAutoReviewIterations": 1,
    "implementerFanout": "always",
    "reviewFanout": "always"
}
```

Concurrency changes speed, not the number of model calls. Auto review iterations repeat the selected review route and final review, so start at one iteration and only increase it when the extra review cycle is earning its cost.

## Model-family diversity is a feature

The aim isn't to crown one model family. Different models make different assumptions, notice different risks, and have different strengths in tool use, long-context reading, architecture, implementation, and review. Deliberately varying the Planner, Designer, Implementer, Reviewer, and critics gives the workflow more independent perspectives.

Don't dismiss a model because it's cheap or unfashionable in a broad benchmark. Hy3 and standard MiMo V2.5 are often underestimated, yet both can be excellent on narrow, well-constrained work. And a model that benchmarks well for code generation isn't automatically the right Coordinator, Explorer, or Reviewer. Match the model to the role, then test it on the kind of work you actually run.
