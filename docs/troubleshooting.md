# Troubleshooting

Most problems fall into a handful of patterns. Start with `/specops-doctor` — its report names the failing layer and usually the fix.

## OpenSpec CLI problems

**"OpenSpec CLI not found"**
Install it globally: `npm install -g @fission-ai/openspec`, then restart OpenCode.

**"incompatible install" with missing capabilities**
Your installed OpenSpec is too old for the commands SpecOps relies on. Upgrade with `npm install -g @fission-ai/openspec` and run `/specops-doctor` again. Versions whose capability probes pass keep working — only a genuinely missing capability blocks.

**"OpenSpec project not initialized"**
Run `/specops-onboard`. This normally happens automatically on first use; the explicit command is safe to run anytime.

## Configuration problems

**"SpecOps configuration invalid"**
Open the file at `~/.config/opencode/specops.json` (or `$XDG_CONFIG_HOME/opencode/specops.json`) — the doctor reports the concrete validation error. Common causes:

- A `variant` set on a role without a `model`
- A concurrency or iteration value that is not a positive whole number (`0`, negatives, fractions)
- Role keys that do not match the [configurable roles](configuration.md#configurable-roles)

Fixing it in the Configure screen (`Ctrl+P` → SpecOps Configure) is usually easier than hand-editing.

**A role shows an unavailable model**
The Configure screen flags roles whose saved model no longer exists in your OpenCode catalogue (renamed, removed provider, typo). Re-select the model for that role; everything else is preserved.

**Review specialists use the "wrong" model**
They inherit the Reviewer's model and variant unless they have their own entry — see [review specialist inheritance](configuration.md#configurable-roles).

## Workflow problems

**The run stopped with `BLOCKED`**
This is deliberate. The report names the phase, the exact blocker, the evidence, and a recommended next action — typically information only you can supply (credentials, access, a product decision). Provide what it asks for and run the command again; nothing was lost, it's all in OpenSpec state.

**A review stopped with `BLOCKED` and a list of `violations`**
During the review window, review agents are not allowed to change tracked repository files or the `openspec/` tree. If protected state changed mid-review, the run stops with the exact paths and how each changed (`modified`, `added`, `removed`) rather than passing a review that no longer matches the work. Rerun the command; completed planning and implementation work is preserved in OpenSpec state.

**Auto ended immediately with `BLOCKED` mentioning iterations**
Every [Auto review correction cycle](how-it-works.md#standard-vs-auto) consumes one of a finite budget (default 3). Either address the reported findings yourself, raise the budget in `specops.json`, or start a fresh change scoped more narrowly.

**Planning or review fails validation**
SpecOps refuses to author planning artifacts against an invalid change, and refuses to pass review until the change validates again. Route the problem back through the workflow (`/specops-update <what's wrong>`) rather than editing artifacts around it.

**A specialist return looked malformed**
One bounded recovery per dispatch is automatic: the same agent session is asked to re-emit its result. If recovery fails, the run stops as `BLOCKED` naming the specialist — rerun the command to continue from saved state.

**Parallel work restarts only after every in-flight specialist finishes**
Without `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=true`, OpenCode's foreground task calls return their results together, so concurrency works in waves: a freed slot is only refilled once all in-flight siblings have finished. Launch OpenCode with that variable set (see [Configuration](configuration.md#maxsubagentconcurrency-default-1)) and each specialist's completion immediately opens its slot again.

**A small change no longer gets parallel implementers or three review critics**
Deliberate. Both fan-out stages are size-gated (`auto` by default): small or simple changes build with one implementer and are reviewed by the final Reviewer alone, while larger or riskier changes still fan out. Set [implementerFanout](configuration.md#implementerfanout-default-auto) or [reviewFanout](configuration.md#reviewfanout-default-auto) to `always` in `specops.json` if you want the previous always-parallel behaviour.

**The coordinator refused to edit files or run shell commands itself**
Working as intended. Coordinators orchestrate; specialist agents do the hands-on work.

**An Auto run stopped unexpectedly early**
Host-level loop protection ends turns that repeat without progress instead of spinning indefinitely. Resume with `/specops-auto`; completed work is preserved in OpenSpec artifacts.

## Environment notes

- Changing **Frontier escalation** requires restarting OpenCode — the Frontier agent is registered at startup only.
- The optional Engram memory server being absent is never an error; agents simply skip it.
- Concurrency defaults to **1**: if stages that used to overlap now run one-at-a-time, check [maxSubagentConcurrency](configuration.md#maxsubagentconcurrency-default-1).
- Fan-out stages default to **auto**: parallel implementer lanes and the three-critic review only run when a change is large or risky enough to earn them — see [implementerFanout](configuration.md#implementerfanout-default-auto) and [reviewFanout](configuration.md#reviewfanout-default-auto).
- For per-completion slot refill across parallel stages, launch OpenCode with `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=true` — otherwise parallel work refills in waves.

Still stuck? Search the [issue tracker](https://github.com/jrpbuilds/specops-opencode/issues) or open a new issue with your `/specops-doctor` output (redact anything private).
