# Packaged SpecOps skills

This directory holds the skills SpecOps ships with the package. OpenCode discovers
them through its native skill system: the SpecOps plugin appends this directory to
the host's `skills.paths` configuration, and OpenCode lists and loads each skill on
demand via its built-in `skill` tool. Nothing here is copied or installed into an
OpenCode configuration directory, and any user- or project-configured skill paths
are preserved.

Each skill lives in its own `<name>/SKILL.md` folder. Packaged skill names always
start with the `specops-` prefix so they cannot collide with user skills in
OpenCode's single shared namespace.

See [docs/skills.md](https://github.com/jrpbuilds/specops-opencode/blob/main/docs/skills.md) for the capability contract and authoring
conventions, and `specops-example` for a working template.

The initial catalogue adds focused frontend, backend, database, security, and
testing capabilities. See the catalogue table in `docs/skills.md` to choose the
skill whose trigger matches the work at hand.
