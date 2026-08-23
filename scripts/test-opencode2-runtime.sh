#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
temporary="$(mktemp -d)"
trap 'rm -rf "$temporary"' EXIT

export XDG_CONFIG_HOME="$temporary/config"
export XDG_CACHE_HOME="$temporary/cache"
export XDG_STATE_HOME="$temporary/state"
mkdir -p "$temporary/project"

jq -n --arg plugin "$root" '{plugins: [$plugin]}' > "$temporary/project/opencode.json"

cd "$temporary/project"

plugin_json="$(timeout 60s opencode2 api get /api/plugin)"
printf '%s\n' "$plugin_json" | jq -e '.. | objects | select(.id? == "specops" and .status? == "active")' >/dev/null

agent_json="$(timeout 60s opencode2 api get /api/agent)"
printf '%s\n' "$agent_json" | jq -e '.. | objects | select(.id? == "SpecOps" and .mode? == "primary")' >/dev/null
printf '%s\n' "$agent_json" | jq -e '.. | objects | select(.id? == "SpecOps Auto" and .mode? == "primary")' >/dev/null
printf '%s\n' "$agent_json" | jq -e '.. | objects | select(.id? == "specops-planner" and .mode? == "subagent" and .hidden? == true)' >/dev/null

command_json="$(timeout 60s opencode2 api get /api/command)"
for command in specops specops-auto specops-update specops-sync specops-doctor specops-onboard; do
    printf '%s\n' "$command_json" | jq -e --arg command "$command" '.. | objects | select(.name? == $command)' >/dev/null
done

printf 'OpenCode 2 runtime smoke passed\n' >&2
