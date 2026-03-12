#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLAUDE_FILE="$ROOT_DIR/CLAUDE.md"
AGENTS_FILE="$ROOT_DIR/AGENTS.md"

if [[ ! -e "$CLAUDE_FILE" && ! -e "$AGENTS_FILE" ]]; then
  exit 0
fi

if [[ ! -e "$CLAUDE_FILE" && -e "$AGENTS_FILE" ]]; then
  cp -f "$AGENTS_FILE" "$CLAUDE_FILE"
fi

if [[ -e "$CLAUDE_FILE" && ! -e "$AGENTS_FILE" ]]; then
  ln -s "CLAUDE.md" "$AGENTS_FILE"
fi

if [[ -e "$CLAUDE_FILE" && -e "$AGENTS_FILE" ]]; then
  if [[ ! "$AGENTS_FILE" -ef "$CLAUDE_FILE" ]]; then
    claude_mtime="$(stat -f "%m" "$CLAUDE_FILE")"
    agents_mtime="$(stat -f "%m" "$AGENTS_FILE")"

    if (( agents_mtime > claude_mtime )); then
      cp -f "$AGENTS_FILE" "$CLAUDE_FILE"
    fi

    rm -f "$AGENTS_FILE"
    ln -s "CLAUDE.md" "$AGENTS_FILE"
  fi
fi

if git -C "$ROOT_DIR" rev-parse --git-dir >/dev/null 2>&1; then
  git -C "$ROOT_DIR" add -- "$CLAUDE_FILE" "$AGENTS_FILE"
fi
