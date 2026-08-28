# Getting started

SpecOps is an [OpenCode](https://opencode.ai) plugin that runs software changes through a structured [OpenSpec](https://github.com/Fission-AI/OpenSpec) workflow using specialist agents. This page takes you from nothing to your first completed change.

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

SpecOps uses [OpenSpec](https://github.com/Fission-AI/OpenSpec) to store change state, so its CLI needs to be on your PATH:

```bash
npm install -g @fission-ai/openspec
```

Restart OpenCode after installing both.

## Check the installation

Run the doctor command inside OpenCode:

```text
/specops-doctor
```

A healthy report covers four things: the OpenSpec CLI is available and compatible, the current project is initialised for OpenSpec, your SpecOps configuration file is valid, and your configured models actually resolve. If something fails, the report tells you what to do next. More detail in [Troubleshooting](troubleshooting.md).

## Run your first change

Open a project and give SpecOps a goal:

```text
/specops improve the API error responses and add coverage for the new behaviour
```

That's the whole interaction model: describe the outcome you want in plain language.

The first run initialises OpenSpec in the project for you. You can also do it explicitly at any time:

```text
/specops-onboard
```

## What happens next

The coordinator investigates your repository and plans the requirements and design for your approval. Once you approve, specialist agents implement the change, and the finished work goes through independent review before anything is archived. In Standard mode you stay in control at every checkpoint: SpecOps never archives a change without your say-so.

While the change runs, its state lives in ordinary files under `openspec/changes/<change>/` (proposal, specifications, design, tasks). There's no hidden side database, so you can stop mid-change, close the terminal, and pick it up later with the same command.

## Choose your mode

| Mode       | Command                | Behaviour                                                                    |
| ---------- | ---------------------- | ---------------------------------------------------------------------------- |
| Standard   | `/specops <goal>`      | Asks you to approve the plan and after every review result                   |
| Autonomous | `/specops-auto <goal>` | Runs end-to-end without checkpoints, retrying failed reviews within a budget |

Start with Standard until you trust the results on your codebase. Auto is better for routine or well-understood changes. Both are covered in [Commands](commands.md).

## Next steps

- [How it works](how-it-works.md) — what the agents actually do, stage by stage
- [Configuration](configuration.md) — map each role to a different model
- [Model recommendations](model-recommendations.md) — which model classes suit which roles
- [Troubleshooting](troubleshooting.md) — when something looks wrong
