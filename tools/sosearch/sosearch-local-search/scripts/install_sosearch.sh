#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${SOSEARCH_REPO_URL:-https://github.com/NetLops/SoSearch.git}"
INSTALL_DIR="${SOSEARCH_INSTALL_DIR:-$HOME/.openclaw/workspace/_repos/SoSearch}"

mkdir -p "$(dirname "$INSTALL_DIR")"

if [ ! -d "$INSTALL_DIR/.git" ]; then
  git clone "$REPO_URL" "$INSTALL_DIR"
else
  git -C "$INSTALL_DIR" pull --ff-only
fi

if ! command -v cargo >/dev/null 2>&1; then
  echo "cargo not found. Install Rust first." >&2
  exit 1
fi

cd "$INSTALL_DIR"
cargo build --release

echo "Built: $INSTALL_DIR/target/release/SoSearch"
