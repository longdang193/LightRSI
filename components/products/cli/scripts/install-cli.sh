#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_CLI="$ROOT_DIR/dist/cli.js"
BIN_DIR="${LIGHTRSI_BIN_DIR:-${LIGHTMEM2_BIN_DIR:-$HOME/.local/bin}}"
TARGET="$BIN_DIR/lightrsi"
LEGACY_TARGET="$BIN_DIR/lightmem2"

mkdir -p "$BIN_DIR"

if [[ ! -f "$DIST_CLI" ]]; then
  echo "lightrsi CLI is not built yet. Run 'pnpm lightrsi:build' first." >&2
  exit 1
fi

ln -sf "$DIST_CLI" "$TARGET"
ln -sf "$DIST_CLI" "$LEGACY_TARGET"
chmod +x "$DIST_CLI" "$TARGET" "$LEGACY_TARGET"

echo "Installed lightrsi -> $TARGET"
echo "Installed compatibility alias lightmem2 -> $LEGACY_TARGET"
echo "If '$BIN_DIR' is not on your PATH, add it before using 'lightrsi'."
