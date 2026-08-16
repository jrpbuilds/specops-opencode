# Contributing to SpecOps

Thanks for helping make SpecOps better. This project is a small, deterministic
plugin layer; the best contributions keep the code boring and leave reasoning
to the models.

Before you start, please read [`AGENTS.md`](AGENTS.md) for the conventions this
repository expects from automated and human contributors.

## Getting started

SpecOps uses [Bun](https://bun.sh) (>=1.3.0) for development, testing, and
building.

```bash
bun install
bun run check
```

`bun run check` runs the full quality chain:
Prettier formatting, ESLint, TypeScript type checks, the test suite with
coverage gate, and a packed-package smoke test.

## Running tests

```bash
bun test              # fast local run
bun run test:coverage # run with the 90% line-coverage gate
```

## Verifying the packed package

```bash
bun run test:packed
```

This builds the plugin, packs it with `bun pm pack`, and smoke tests the
resulting tarball so releases are not broken by bundling or `files` field
mistakes.

## Editing prompts

The prompts under [`prompts/`](prompts/) are plain Markdown. Shared fragments are
included via the `{{include: shared/<fragment>.md}}` syntax resolved by
[`src/prompts.ts`](src/prompts.ts). Keep fragments focused and reusable across
multiple agent prompts.

## Submitting changes

1. Open an issue or comment on an existing one so the work is visible.
2. Make the smallest change that satisfies the requirement.
3. Add or update tests for new or changed behaviour.
4. Ensure `bun run check` passes locally.
5. Open a pull request using the provided template.

## Release notes

This repository uses OpenSpec for planned changes. Pull requests should normally
reference an OpenSpec change and update its tasks rather than introducing
untracked large refactorings.
