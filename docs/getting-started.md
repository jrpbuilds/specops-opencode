# Getting started

SpecOps is an [OpenCode](https://opencode.ai) plugin that runs software changes through a structured [OpenSpec](https://github.com/Fission-AI/OpenSpec) workflow using specialist agents. This page gets you from zero to your first completed change.

## Prerequisites

- [OpenCode](https://opencode.ai) installed and running
- Node.js/npm available for the OpenSpec CLI
- A project you want to change

## Install SpecOps

Install the plugin through OpenCode:

```bash
opencode plugin @jrpbuilds/specops-opencode -g
```

## Install the OpenSpec CLI

SpecOps drives [OpenSpec](https://github.com/Fission-AI/OpenSpec) for durable change state, so its CLI must be available:

```bash
npm install -g @fission-ai/openspec
```

Restart OpenCode after installing both.

## Check the installation

Run the doctor command inside OpenCode:

```text
/specops-doctor
```

A healthy report confirms four things: the OpenSpec CLI is available and compatible, the current project is initialised for OpenSpec, your SpecOps configuration file is valid, and your configured models resolve. If anything fails, the report says what to do next — see [Troubleshooting](troubleshooting.md).

## Run your first change

Open a project and give SpecOps a goal:

```text
/specops improve the API error responses and add coverage for the new behaviour
```

That is the whole interaction model: describe the outcome you want in plain language.

On first use, SpecOps initialises OpenSpec in the project automatically. You can also initialise explicitly at any time:

```text
/specops-onboard
```

## What happens next

The coordinator investigates your repository, plans the requirements and design for your approval, implements the change with specialist agents, then puts the finished work through independent review before anything is archived. You approve the plan before implementation starts, and decide what happens after review — SpecOps never archives a change without your say-so in Standard mode.

While the change runs, its state lives in ordinary files under `openspec/changes/<change>/` (proposal, specifications, design, tasks). Nothing is hidden in a side database, so you can stop mid-change, close the terminal, and resume later with the same command.

## Choose your mode

| Mode       | Command                | Behaviour                                                                    |
| ---------- | ---------------------- | ---------------------------------------------------------------------------- |
| Standard   | `/specops <goal>`      | Asks you to approve the plan and after every review result                   |
| Autonomous | `/specops-auto <goal>` | Runs end-to-end without checkpoints, retrying failed reviews within a budget |

Start with Standard until you trust the results on your codebase, then use Auto for routine or well-understood changes — see [Commands](commands.md).

## Next steps

- [How it works](how-it-works.md) — what the agents actually do, stage by stage
- [Configuration](configuration.md) — map each role to a different model
- [Model recommendations](model-recommendations.md) — which model classes suit which roles
- [Troubleshooting](troubleshooting.md) — when something looks wrong
