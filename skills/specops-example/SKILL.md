---
name: specops-example
description: Reference template for packaged SpecOps skills. Use when authoring or reviewing a SpecOps skill under the packaged skills directory, or when checking whether a skill satisfies the SpecOps capability contract.
license: MIT
metadata:
    author: specops
    role: template
---

# Packaged SpecOps skill template

This skill is a working example of the packaged skill format. Copy it when adding a
new packaged skill, rename the folder and `name` to the new capability, and replace
this body with specialist engineering expertise.

## Required shape

- One folder per skill under `skills/`, named `specops-<capability>` in kebab-case.
- A `SKILL.md` file whose frontmatter `name` exactly matches its folder name.
- A `description` that states what the skill provides and when to use it. OpenCode
  only lists skills that carry a description, so a missing or vague description
  makes a skill undiscoverable in practice.

## What a packaged skill may and may not do

- Provide specialist engineering expertise, not workflow policy. Phase order,
  routing, lifecycle authority, and permissions stay with the SpecOps roles and the
  runtime.
- Stay subordinate to approved OpenSpec artifacts, current repository behaviour,
  and project conventions. When a skill contradicts any of those, they win.
- Stay proportional to the actual assignment. Advise for the work at hand rather
  than imposing generic checklists, and never broaden the assigned scope.
- Be useful to a competent base role. A skill compensates for missing specialist
  knowledge, never for a weakened role prompt.
