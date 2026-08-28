# Commands

SpecOps registers six commands in OpenCode. All of them operate on the active OpenSpec change for the current project.

## `/specops <goal>`

Starts or resumes a change in Standard mode.

```text
/specops stop the background animation when the game is over
```

- Establishes exactly one current change (resuming an existing relevant one instead of creating duplicates).
- Takes you through: investigation → plan approval → implementation → three-way review → your decision on the result.
- Re-running it later in the same project resumes any active change from saved state.

## `/specops-auto <goal>`

Runs the same workflow autonomously with no human checkpoints and ends with a terminal report:

- `COMPLETED` — with the archived change name/path plus verification results, or
- `BLOCKED` — with what stopped the run, the evidence, and what to do next.

Failed reviews are corrected and re-reviewed automatically within your [Auto review iterations](configuration.md#maxautoreviewiterations-default-3) budget.

For headless runs:

```bash
opencode run --auto --command specops-auto "<goal>"
```

## `/specops-update <feedback>`

Revises the active change in place without starting over:

```text
/specops-update the timeout should be configurable via environment variable
```

The feedback goes verbatim to the specialist that owns the affected artifact, downstream artifacts get reconciled, and in Standard mode the plan approval is re-presented if the effective plan changed. Use it to steer a change that's already underway.

## `/specops-sync [<change-name>]`

Synchronises an active change's delta specifications into the project's main specs **without archiving** the change:

```text
/specops-sync
/specops-sync add-health-endpoint
```

Useful when a parallel change needs to build on newly defined specs, or when you want to review the merged main specs while keeping the change open. With several active changes, Standard mode asks which one; Auto mode picks the most recently modified. The change stays active afterwards and still finishes through the normal archive flow.

## `/specops-onboard`

Initialises OpenSpec in the current project. SpecOps does this automatically on first use, so you only need the explicit command when setting up a project ahead of time or re-checking initialization.

## `/specops-doctor`

Diagnoses the installation in one shot:

- SpecOps version and OpenSpec CLI availability/compatibility
- Whether the current project is initialised for OpenSpec
- Whether your `specops.json` parses and validates
- Whether archived changes still validate against the current OpenSpec schema
- How many of the ten roles have explicit model mappings vs inheriting OpenCode's default

Run it first whenever anything behaves oddly. If it reports a problem, [Troubleshooting](troubleshooting.md) has the fixes.

## Tips

- One goal per command, and describe outcomes rather than implementation steps.
- Feedback during checkpoints (plan approval, review result) goes to the specialist that owns the affected work, verbatim. Write it as you'd brief a colleague.
- Nothing is archived without an explicit choice in Standard mode. Leaving a change open is always safe, and you can come back to it later.
