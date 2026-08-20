<div align="center">

# SpecOps

**Spec-driven development for OpenCode, with the right model for each job.**

[![npm version](https://img.shields.io/npm/v/@jrpbuilds/specops-opencode?logo=npm&logoColor=white)](https://www.npmjs.com/package/@jrpbuilds/specops-opencode)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![coverage](https://img.shields.io/github/actions/workflow/status/jrpbuilds/specops-opencode/ci.yml?branch=main&label=coverage)](https://github.com/jrpbuilds/specops-opencode/actions/workflows/ci.yml)
[![OpenCode](https://img.shields.io/badge/OpenCode-plugin-5c6ac4)](https://opencode.ai)
[![OpenSpec](https://img.shields.io/badge/powered%20by-OpenSpec-444)](https://github.com/Fission-AI/OpenSpec)

</div>

SpecOps is a lightweight [OpenCode](https://opencode.ai) plugin for running software changes through a structured [OpenSpec](https://github.com/Fission-AI/OpenSpec) workflow.

Give it a goal:

```text
/specops add a health endpoint with tests
```

SpecOps coordinates specialist agents to investigate the repository, define the requirements, design the solution, plan the implementation, write the code, and independently review the result.

Each role can use a different model, while OpenSpec remains the durable source of truth for the change.

## Install

Install SpecOps through OpenCode:

```bash
opencode plugin @jrpbuilds/specops-opencode -g
```

Install the OpenSpec CLI:

```bash
npm install -g @fission-ai/openspec
```

Then restart OpenCode.

Check the installation:

```text
/specops-doctor
```

## Getting started

Open a project and give SpecOps a goal:

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
agents cannot invoke them, and they are hidden from the `@` autocomplete menu.
They cannot themselves delegate to further subagents.

Coordinator agents have native edit tools disabled and may use the shell only
for `openspec --help` lookups. Ordinary OpenCode primary agents can use the
user-facing `specops_doctor` and `specops_onboard` tools, while OpenSpec context,
change creation, and archive operations remain Coordinator-owned.

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

Configuration is stored at:

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

Leave a role unset to inherit OpenCode's default model.

`frontierEscalation` controls whether the Frontier agent is registered. Changing it requires restarting OpenCode.

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
opencode run --auto --command specops-auto "<goal>"
```

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
bun run check
```

Build the plugin with:

```bash
bun run build
```

SpecOps uses Bun and TypeScript throughout.

## Status

SpecOps v1.0.0 is released and being dogfooded against real software changes.
The v1.0.0 milestone delivers schema-aware planning specialists, status-routed
coordinator orchestration, and the `specops_status` lifecycle tool. Post-1.0
work is tracked in the [issue tracker](https://github.com/jrpbuilds/specops-opencode/issues).

> Make structured multi-model software development useful without building another workflow engine.

## Community

- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)
- [Code of conduct](CODE_OF_CONDUCT.md)

## License

MIT — built by [@jrpbuilds](https://github.com/jrpbuilds).
