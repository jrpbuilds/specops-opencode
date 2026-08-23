#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
temporary="$(mktemp -d)"
trap 'rm -rf "$temporary"' EXIT

export XDG_CONFIG_HOME="$temporary/config"
export XDG_CACHE_HOME="$temporary/cache"
export XDG_STATE_HOME="$temporary/state"
mkdir -p "$temporary/project"

# Exercise V2's config-driven local plugin loader with a project-local wrapper.
# Relative plugin paths are resolved from the config document and imported
# directly, so this tests the built package without publishing it first.
cat > "$temporary/project/specops-plugin.js" <<EOF
export { default } from "file://$root/dist/index.js";
EOF
cat > "$temporary/project/opencode.json" <<'EOF'
{
  "plugins": [
    { "package": "./specops-plugin.js" }
  ]
}
EOF

git -C "$temporary/project" init -q
git -C "$temporary/project" config user.email "ci@example.invalid"
git -C "$temporary/project" config user.name "SpecOps CI"
touch "$temporary/project/.gitkeep"
git -C "$temporary/project" add .gitkeep opencode.json specops-plugin.js
git -C "$temporary/project" commit -qm "runtime fixture"

cd "$temporary/project"

encoded_project="$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$temporary/project")"
api() {
    local path="$1"
    local separator="?"
    [[ "$path" == *\?* ]] && separator="&"
    timeout 60s opencode2 api get "${path}${separator}location%5Bdirectory%5D=${encoded_project}"
}

# Plugin loading is asynchronous in the V2 host, so wait briefly for the
# configured plugin to become active instead of racing the loader.
plugin_json=""
for attempt in $(seq 1 50); do
    plugin_json="$(api /api/plugin)"
    if printf '%s\n' "$plugin_json" | jq -e '.. | objects | select(.id? == "specops" and .status? == "active")' >/dev/null; then
        break
    fi
    sleep 0.2
done
if ! printf '%s\n' "$plugin_json" | jq -e '.. | objects | select(.id? == "specops" and .status? == "active")' >/dev/null; then
    printf 'SpecOps did not become active in OpenCode 2. Last plugin payload:\n%s\n' "$plugin_json" >&2
    exit 1
fi

agent_json="$(api /api/agent)"
printf '%s\n' "$agent_json" | jq -e '.. | objects | select(.id? == "SpecOps" and .mode? == "primary")' >/dev/null
printf '%s\n' "$agent_json" | jq -e '.. | objects | select(.id? == "SpecOps Auto" and .mode? == "primary")' >/dev/null
printf '%s\n' "$agent_json" | jq -e '.. | objects | select(.id? == "specops-planner" and .mode? == "subagent" and .hidden? == true)' >/dev/null

command_json="$(api /api/command)"
for command in specops specops-auto specops-update specops-sync specops-doctor specops-onboard; do
    printf '%s\n' "$command_json" | jq -e --arg command "$command" '.. | objects | select(.name? == $command)' >/dev/null
done

printf 'OpenCode 2 runtime smoke passed\n' >&2
