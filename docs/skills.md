# Packaged skills

SpecOps ships a small set of specialist skills inside the package. They ride on
OpenCode's native skill system: OpenCode lists each skill for every agent, and an
agent loads the full content on demand through the built-in `skill` tool when the
work at hand matches one.

Skills are a capability layer, not a workflow layer. They carry engineering
expertise — how to approach a class of problem, what to check, what good looks
like — while the SpecOps roles, prompts, and runtime keep owning workflow policy.

## How discovery works

The packaged skills live in the package's `skills/` directory beside the role
prompts. When the SpecOps plugin loads, it registers that directory with OpenCode
through the host's `skills.paths` configuration. Nothing is copied or installed
into an OpenCode configuration directory, and any skill folders you configure
yourself — project or global — keep working untouched.

Because discovery is native, packaged skills behave exactly like your own skills:

- they appear in the `skill` tool's available-skills listing for every agent;
- they load on demand only when an agent chooses to use one;
- you can deny or gate them with the usual `permission.skill` rules;
- a missing or damaged packaged directory degrades gracefully — the workflow
  works without them.

## The capability contract

Every packaged SpecOps skill follows one contract:

- **Expertise, not policy.** Skills provide specialist engineering knowledge. They
  never define phase order, routing, or lifecycle steps, and they cannot grant
  permissions or lifecycle authority.
- **Artifacts and conventions win.** Approved OpenSpec artifacts, current
  repository behaviour, and project conventions are authoritative. When a skill's
  advice conflicts with any of those, the skill loses.
- **Proportional, never generic.** A skill advises for the actual assignment
  instead of imposing checklists, and it never broadens the scope an assignment
  was given.
- **Useful to a competent base role.** Skills add specialist depth on top of the
  role prompts; they are never a crutch that compensates for a weak role prompt.

## The packaged catalogue

| Skill                          | Provides                                                                                                   | Use when                                                                          |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `specops-example`              | A working packaged-skill template                                                                          | Authoring or reviewing a packaged SpecOps skill                                   |
| `specops-frontend-engineering` | Interaction, state, forms, accessibility, responsive behavior, and safe rendering guidance                 | Browser-visible behavior or client-side state changes                             |
| `specops-backend-engineering`  | Service contracts, trust boundaries, side effects, compatibility, and observability guidance               | Server behavior, integrations, or API contracts change                            |
| `specops-database-engineering` | Schema, migration, integrity, transaction, concurrency, and query guidance                                 | Persisted data, queries, or database-backed workflows change                      |
| `specops-security-engineering` | Trust-boundary, access-control, secret-handling, unsafe-input, and secure-failure guidance                 | Access, exposure, credentials, or untrusted-data handling changes                 |
| `specops-testing`              | Behavior-focused verification, failure boundaries, integration choices, and regression protection guidance | A change needs deeper verification design than the repository's usual conventions |

Each specialist skill is intentionally narrow and on-demand. It supplements a
competent base role without deciding workflow, expanding the approved task, or
prescribing a framework that the repository has not already chosen.

## Naming and format

Each skill is one folder with one `SKILL.md` file:

```
skills/
  specops-<capability>/
    SKILL.md
```

- `name` matches the folder name and always carries the `specops-` prefix, so
  packaged skills cannot collide with your own skills in OpenCode's single
  shared namespace.
- `description` states what the skill provides and when to use it. OpenCode only
  lists skills that carry a description, so a missing or vague description makes
  a skill undiscoverable in practice.
- `license` and `metadata` are optional; OpenCode ignores unknown fields.

`specops-example` in the package is a working template — copy it when authoring a
new packaged skill. A test harness validates every packaged skill against these
rules, and the packed-install smoke test proves the tree stays complete and
discoverable after publishing.

## Version compatibility

Packaged skill discovery requires OpenCode 1.18.31 or newer, which is also the
version SpecOps' plugin interface targets. On older OpenCode versions the skills
are simply not registered; the rest of SpecOps is unaffected.
