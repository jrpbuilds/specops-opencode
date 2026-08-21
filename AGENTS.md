# AGENTS.md

Keep the code simple, readable, and easy to follow.

Use clear function and variable names so the code mostly explains itself.

Add docblocks to functions/classes that provide useful context, especially for non-obvious behaviour, side effects, or important constraints.

Add inline comments only where something needs explanation. Prefer comments that explain **why** rather than narrating what the code already makes obvious.

Do not add comments or documentation just for the sake of it.

## Changelog entries

Write short, user-facing release notes. Each entry should briefly describe one
addition, change, or fix and its user-visible benefit. Avoid internal
implementation details, file paths, test results, architecture, and long
rationale. Keep entries to one concise sentence or two short lines, and include
an issue reference when relevant.

## Formatting before commit

Run `bun run format` and verify `bun run format:check` passes before staging a commit or pushing. Never commit or push changes that fail the Prettier check.
