<div align="center">

# SpecOps

**Spec-driven development for OpenCode, with the right model for each job.**

[![npm version](https://img.shields.io/npm/v/@jrpbuilds/specops-opencode?logo=npm&logoColor=white)](https://www.npmjs.com/package/@jrpbuilds/specops-opencode)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![OpenCode](https://img.shields.io/badge/OpenCode-plugin-5c6ac4)](https://opencode.ai)
[![OpenSpec](https://img.shields.io/badge/powered%20by-OpenSpec-444)](https://github.com/Fission-AI/OpenSpec)

</div>

SpecOps is a lightweight [OpenCode](https://opencode.ai) plugin for running software changes through a structured [OpenSpec](https://github.com/Fission-AI/OpenSpec) workflow.

Give it a goal:

```text
/specops add a health endpoint with tests
```

SpecOps coordinates specialist models to investigate the repository, define the requirements, design the solution, build an implementation plan, write the code, and independently review the result.

OpenSpec artifacts are the durable source of truth. The models decide what work needs doing and which specialist should do it. TypeScript stays deliberately boring and handles only deterministic plugin operations.

## How it works

```text
/specops <goal>
      │
      ▼
  Coordinator
      │
      ├── Explorer      repository investigation
      │
      ├── Planner       proposal + capability specs
      │
      ├── Designer      technical design
      │
      ├── Planner       implementation tasks
      │
      ├── Implementer   source + tests
      │
      └── Reviewer      independent verification
```

Each role can use a different model and reasoning variant.

A typical change is persisted through normal OpenSpec artifacts:

```text
openspec/changes/<change>/
├── proposal.md
├── specs/
├── design.md
└── tasks.md
```

There is no parallel SpecOps workflow state machine. Existing OpenSpec artifacts and task completion are used to determine what needs to happen next, which also makes interrupted changes naturally resumable.

## Install

Install the plugin using OpenCode:

```bash
opencode plugin @jrpbuilds/specops-opencode -g
```

SpecOps also requires the OpenSpec CLI to be installed:

```bash
npm install -g @fission-ai/openspec
```

Then restart OpenCode.

## Getting started

Open a project and run:

```text
/specops-onboard
```

This initialises the project for OpenSpec without installing OpenSpec's own OpenCode commands or skills.

Check everything is ready:

```text
/specops-doctor
```

Then start a change:

```text
/specops improve the API error responses and add coverage for the new behaviour
```

SpecOps will coordinate the change through the appropriate specialist agents.

## Model configuration

Open the OpenCode command palette with `Ctrl+P` and select:

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

Configuration is stored in:

```text
~/.config/opencode/specops.json
```

or the equivalent `$XDG_CONFIG_HOME/opencode/specops.json`.

Example:

```json
{
    "frontierEscalation": false,
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

Leave a model unset to inherit OpenCode's default model.

`frontierEscalation` controls whether the `specops-frontier` subagent is registered. Changing this setting requires restarting OpenCode to take effect, because the registered agent catalogue changes.

## Commands

### `/specops <goal>`

Starts or resumes SpecOps work using the SpecOps Coordinator.

```text
/specops stop the background animation when the game is over
```

### `/specops-auto <goal>`

Runs the same workflow autonomously with no human checkpoints, finishing with a terminal `COMPLETED` or `BLOCKED` report. Designed for headless runs:

```bash
opencode run --auto --command specops-auto "<goal>"
```

### `/specops-onboard`

Initialises OpenSpec in the current project.

### `/specops-doctor`

Checks the SpecOps installation, OpenSpec availability and project state, configuration, and configured model roles.

## Design philosophy

SpecOps intentionally keeps the plugin layer small.

**Models own reasoning and orchestration.**

The Coordinator decides what work is needed and delegates it to specialist agents using OpenCode's native subagent support.

**OpenSpec owns durable workflow state.**

Proposal, specifications, design, tasks, and task completion live in OpenSpec rather than a second SpecOps state system.

**TypeScript owns deterministic operations.**

Operations such as onboarding, diagnostics, and OpenSpec lifecycle mutations are implemented as small deterministic tools rather than spending model tokens on predictable plumbing.

**Specialists stay specialised.**

The Explorer investigates. The Planner defines requirements and tasks. The Designer designs. The Implementer implements. The Reviewer independently verifies.

No agent needs to pretend it can do everything well.

## Development

```bash
bun install
bun run check
```

The project uses Bun for development, building and testing, with TypeScript throughout.

Build the plugin with:

```bash
bun run build
```

## Status

SpecOps is under active development and is being dogfooded against real software changes as the workflow is expanded.

The goal is deliberately simple:

> Make structured multi-model software development useful without building another workflow engine.

## License

MIT — built by [@jrpbuilds](https://github.com/jrpbuilds).
