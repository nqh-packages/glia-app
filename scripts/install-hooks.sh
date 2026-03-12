#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_HOOK="$REPO_ROOT/.githooks/pre-commit"
TARGET_DIR="$REPO_ROOT/.git/hooks"
TARGET_HOOK="$TARGET_DIR/pre-commit"

if [[ ! -d "$TARGET_DIR" ]]; then
  echo "Skipping hook install: .git/hooks not found"
  exit 0
fi

mkdir -p "$TARGET_DIR"
cp "$SOURCE_HOOK" "$TARGET_HOOK"
chmod +x "$SOURCE_HOOK" "$TARGET_HOOK" "$REPO_ROOT/scripts/sync-directives.sh"

echo "Installed pre-commit hook -> .git/hooks/pre-commit"
