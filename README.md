<div align="center">

# SpecOps

**Spec-driven development for OpenCode, with the right model for each job.**

[![npm beta](https://img.shields.io/npm/v/@jrpbuilds/specops-opencode/beta?logo=npm&logoColor=white&label=beta)](https://www.npmjs.com/package/@jrpbuilds/specops-opencode)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![OpenCode 2 CI](https://img.shields.io/github/actions/workflow/status/jrpbuilds/specops-opencode/v2-migration.yml?branch=beta&label=OpenCode%202)](https://github.com/jrpbuilds/specops-opencode/actions/workflows/v2-migration.yml)
[![OpenCode 2](https://img.shields.io/badge/OpenCode-2%20beta-5c6ac4)](https://opencode.ai/v2/docs)
[![OpenSpec](https://img.shields.io/badge/powered%20by-OpenSpec-444)](https://github.com/Fission-AI/OpenSpec)

</div>

> [!IMPORTANT]
> This branch and the npm `beta` release are for **OpenCode 2 only**. OpenCode 2 is itself still in beta. The `main` branch and npm `latest` remain the OpenCode 1 release line.

SpecOps is a lightweight [OpenCode 2](https://opencode.ai/v2/docs) plugin for running software changes through a structured [OpenSpec](https://github.com/Fission-AI/OpenSpec) workflow.

Give it a goal:

```text
/specops add a health endpoint with tests
```

SpecOps coordinates specialist agents to investigate the repository, define the requirements, design the solution, plan the implementation, write the code, and independently review the result.

Each role can use a different model, while OpenSpec remains the durable source of truth for the change.

## Install

Install the OpenCode 2 beta. It installs alongside OpenCode 1 as the separate `opencode2` binary:

```bash
npm install -g @opencode-ai/cli@beta
```

Install the SpecOps OpenCode 2 beta:

```bash
opencode2 plugin add @jrpbuilds/specops-opencode@beta
```

Install the OpenSpec CLI:

```bash
npm install -g @fission-ai/openspec
```

If OpenCode 2 was already open, restart the client after installing or upgrading the package.

Check the installation:

```text
/specops-doctor
```

`/specops-doctor` checks the installed OpenSpec CLI before trusting its JSON
responses. SpecOps targets the latest OpenSpec version and probes the required
read-only command capabilities with `--help`. Older versions whose capability
probes still pass work too — only a genuine capability gap (a probe that fails)
is reported as an incompatible-install state with remediation. If you upgrade
the CLI later, just run `/specops-doctor` again.

SpecOps also validates the active change with the positional command
`openspec validate <change> --strict --json` before planning artifacts are
authored or a review can pass. Validation is scoped to the active change, so
unrelated changes do not block the workflow.

## Getting started

Open a project in OpenCode 2 and give SpecOps a goal:

```text
/specops improve the API error responses and add coverage for the new behaviour
```

SpecOps automatically initialises OpenSpec on first use.

You can also initialise it explicitly:

```text
/specops-onboard
```

## How it works

The default `spec-driven` schema typically routes a change through these roles; custom schemas may declare a different artifact graph.

```text
/specops <goal>
      │
      ▼
  Coordinator
      │
      ├── Explorer      repository investigation
      ├── Planner       proposal + specifications
      ├── Designer      technical design
      ├── Planner       implementation tasks
      ├── Implementer   source + tests
      └── Reviewer      independent verification
```

In the default `spec-driven` schema, a typical change produces normal OpenSpec artifacts:

```text
openspec/changes/<change>/
├── proposal.md
├── specs/
├── design.md
└── tasks.md
```

SpecOps maintains no parallel state machine because the coordinator derives the next step from OpenSpec's own artifact graph via the `specops_status` tool plus task checkbox state, so custom schemas and interrupted changes resume naturally.

The plugin itself stays deliberately small:

- **Models** handle reasoning and orchestration.
- **OpenSpec** owns durable change state.
- **TypeScript** handles deterministic plugin operations.
- **Specialist agents** stay focused on their assigned role.

### Internal agents

The `specops-*` specialist agents (`specops-explorer`, `specops-planner`,
`specops-designer`, `specops-implementer`, `specops-reviewer`, and, when
enabled, `specops-frontier`) are internal to the SpecOps workflow. Only the
`SpecOps` and `SpecOps Auto` coordinators may dispatch them; other OpenCode
agents cannot invoke them, and they are hidden from normal subagent discovery.
They cannot themselves delegate to further subagents.

Coordinator agents have native edit tools disabled and may use the shell only
for the narrow OpenSpec inspection commands allowed by the role policy. Ordinary
OpenCode primary agents can use the user-facing `specops_doctor` and
`specops_onboard` tools, while OpenSpec context, change creation, status,
validation, and archive operations remain Coordinator-owned. OpenCode 2 tool
visibility is backed by an independent runtime authorization check so the hidden
model surface is not treated as the security boundary.

## Model configuration

Open the OpenCode 2 command palette with `Ctrl+P` and select:

```text
SpecOps Configure
```

Models and reasoning variants can be configured independently for:

- Coordinator
- Explorer
- Planner
- Designer
- Implementer
- Reviewer
- Frontier

Configuration is stored at:

```text
~/.config/opencode/specops.json
```

or the equivalent `$XDG_CONFIG_HOME/opencode/specops.json`.

Example:

```json
{
    "frontierEscalation": false,
    "maxSubagentConcurrency": 2,
    "agents": {
        "specops-coordinator": {
            "model": "opencode-go/deepseek-v4-flash",
            "variant": "high"
        },
        "specops-explorer": {
            "model": "openference/Qwen3.7 Plus",
            "variant": "medium"
        },
        "specops-planner": {
            "model": "openai/gpt-5.6-terra",
            "variant": "high"
        },
        "specops-designer": {
            "model": "openference/GLM-5.2",
            "variant": "max"
        },
        "specops-implementer": {
            "model": "openference/Kimi K2.7 Code",
            "variant": "thinking"
        },
        "specops-reviewer": {
            "model": "openference/DeepSeek-V4-Pro",
            "variant": "high"
        },
        "specops-frontier": {
            "model": "openai/gpt-5.6-sol",
            "variant": "high"
        }
    }
}
```

Leave a role unset to inherit OpenCode's default model.

`frontierEscalation` controls whether the Frontier agent is registered. Changing it requires reloading the plugin or restarting OpenCode 2.

`maxSubagentConcurrency` controls how many independently feasible planning specialists may run concurrently. Supported values are `1`, `2`, `4`, and `8`; the default is `2`.

## Commands

### `/specops <goal>`

Starts or resumes a SpecOps change.

```text
/specops stop the background animation when the game is over
```

### `/specops-auto <goal>`

Runs the workflow autonomously without human checkpoints and finishes with a terminal `COMPLETED` or `BLOCKED` report.

Useful for headless runs:

```bash
opencode2 run --auto --command specops-auto "<goal>"
```

### `/specops-update <revision>`

Revises an active change in place from a goal:

```text
/specops-update <revision>
```

The workflow resumes the active change, determines the owning artifact, dispatches the owning specialist with feedback verbatim, reconciles the revision, and re-presents the plan checkpoint if the effective plan changed. (issue #11)

### `/specops-sync`

Synchronizes an active change's delta specs into the main specs without
archiving it. Use it when a parallel change needs to build on newly defined
specs, or when you want to review the merged main spec before archive. Archive
remains the right path once the change is finished and ready to be finalized.

### `/specops-onboard`

Initialises OpenSpec in the current project.

### `/specops-doctor`

Checks the SpecOps installation, OpenSpec availability, project state, configuration, and configured models.

## Engram (optional)

SpecOps works without Engram.

For cross-session project memory, you can optionally use the [Engram](https://github.com/Gentleman-Programming/engram) MCP server. SpecOps agents may use it for historical architectural decisions, conventions, previous discoveries, and project-specific context.

Engram is contextual memory only. Current user instructions, OpenSpec artifacts, repository state, and executed evidence always take precedence.

Install Engram using its [installation guide](https://github.com/Gentleman-Programming/engram/blob/main/docs/INSTALLATION.md), then follow its [OpenCode setup](https://github.com/Gentleman-Programming/engram/blob/main/docs/AGENT-SETUP.md).

## Example

- [Galaxy Shooter](https://jrpbuilds.github.io/specops-opencode/galaxy-shooter/) — a browser arcade game generated through the SpecOps workflow.

## Development

```bash
bun install
bun run check:v2
```

Build the OpenCode 2 plugin package with:

```bash
bun run build
```

To run the real OpenCode 2 runtime smoke locally, install `@opencode-ai/cli@beta` and run:

```bash
bun run test:runtime:v2
```

SpecOps uses Bun and TypeScript throughout. CI also loads the built package into a real isolated `opencode2` server and verifies the plugin, agent, and command catalogues.

## Status

The `beta` branch is the OpenCode 2 compatibility line and publishes as
`2.0.0-beta.N` under npm's `beta` dist-tag. OpenCode 2 is still a moving beta,
so compatibility may require new SpecOps beta releases as its plugin API changes.

The `main` branch and npm `latest` remain the stable OpenCode 1 line until
OpenCode 2 is officially released.

> Make structured multi-model software development useful without building another workflow engine.

## Community

- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)
- [Code of conduct](CODE_OF_CONDUCT.md)

## License

MIT — built by [@jrpbuilds](https://github.com/jrpbuilds).
