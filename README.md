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

Open a project and run a goal directly:

```text
/specops improve the API error responses and add coverage for the new behaviour
```

SpecOps self-onboards the project for OpenSpec on the first run. To initialise OpenSpec explicitly — for example before the first `/specops` run or on a fresh checkout — use:

```text
/specops-onboard
```

Check everything is ready:

```text
/specops-doctor
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

## Historical project memory (optional)

SpecOps can use [Engram](https://github.com/Gentleman-Programming/engram) as optional cross-session project memory. When Engram's MCP tools are available, the SpecOps Explorer retrieves historical context — architectural rationale, established conventions, prior bug root causes, gotchas, compatibility constraints — reconciles it against the current repository, and folds confirmed context into the same evidence-backed PROJECT CONTEXT capsule that downstream specialists already receive.

Engram is **optional and recommended, not required**. If Engram is not installed, is misconfigured, or returns errors, SpecOps continues exactly as it does without it. Engram never gates `/specops` or `/specops-auto`.

### Boundary

- **OpenSpec remains the sole durable source of truth** for the current change — proposal, specs, design, tasks, review, and archive. SpecOps does not store OpenSpec artifacts, workflow state, or Project Context in Engram.
- **Engram is historical context only.** Repository evidence and approved OpenSpec artifacts always override Engram memory. The Explorer never treats an Engram memory as an approved requirement.
- **Stage 1 is read-only.** SpecOps does not call any Engram write or mutation tool (`mem_save`, `mem_update`, `mem_delete`, `mem_session_summary`, `mem_judge`, `mem_compare`, `mem_review`, and others). Curated writes may arrive in a later stage.

### Setup (MCP-only, recommended for SpecOps)

Install the `engram` binary (see [Engram's installation guide](https://github.com/Gentleman-Programming/engram/blob/main/docs/INSTALLATION.md)), then register the Engram MCP server in your `opencode.json` (global at `~/.config/opencode/opencode.json`, or project-level):

```json
{
    "mcp": {
        "engram": {
            "type": "local",
            "command": ["engram", "mcp"],
            "enabled": true
        }
    }
}
```

Restart OpenCode, then confirm with `/specops-doctor` — the report shows `Engram: <version> (optional)` when the binary is available.

> Why MCP-only for SpecOps? Engram's full OpenCode plugin (`engram setup opencode`) installs a Memory Protocol that proactively saves memories from every agent, including SpecOps specialists. That is excellent for general OpenCode use, but SpecOps Stage 1 is a read-only contract: the Explorer retrieves and reconciles, and specialists must not write to Engram as part of a SpecOps pass. MCP-only gives the Explorer the read tools without turning every specialist into a memory writer. If you already use Engram's full plugin for other work, leave it installed — SpecOps specialist prompts suppress Engram writes for the SpecOps pass regardless.

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
