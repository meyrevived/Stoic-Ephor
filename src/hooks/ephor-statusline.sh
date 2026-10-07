#!/bin/bash
# stoic-ephor — statusline badge script for Claude Code
# Reads the ephor state flag file and outputs a colored badge.
#
# Usage in ~/.claude/settings.json:
#   "statusLine": { "type": "command", "command": "bash /path/to/ephor-statusline.sh" }

FLAG="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/.ephor-state"

# Refuse symlinks
[ -L "$FLAG" ] && exit 0
[ ! -f "$FLAG" ] && exit 0

# Hard-cap read, strip non-alpha
TIER=$(head -c 64 "$FLAG" 2>/dev/null | tr -d '\n\r' | tr '[:upper:]' '[:lower:]')
TIER=$(printf '%s' "$TIER" | tr -cd 'a-z')

# Whitelist
case "$TIER" in
  off|counsel|ephor|spartan|leonidas) ;;
  *) exit 0 ;;
esac

[ -z "$TIER" ] && TIER="ephor"
LABEL=$(printf '%s' "$TIER" | tr '[:lower:]' '[:upper:]')
printf '\033[38;5;245m[%s]\033[0m' "$LABEL"
