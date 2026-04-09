#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SKILL_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
INSTALL_DIR="${SOSEARCH_INSTALL_DIR:-$HOME/.openclaw/workspace/_repos/SoSearch}"
PORT="${SOSEARCH_PORT:-18080}"
LOG_FILE="${SOSEARCH_LOG_FILE:-$HOME/.openclaw/workspace/sosearch-server.log}"
PID_FILE="${SOSEARCH_PID_FILE:-$HOME/.openclaw/workspace/sosearch-server.pid}"
BUNDLED_BIN="$SKILL_ROOT/assets/linux-x64/SoSearch"
BUILT_BIN="$INSTALL_DIR/target/release/SoSearch"

if [ -x "$BUNDLED_BIN" ]; then
  BIN="$BUNDLED_BIN"
elif [ -x "$BUILT_BIN" ]; then
  BIN="$BUILT_BIN"
else
  echo "SoSearch binary not found." >&2
  echo "Checked: $BUNDLED_BIN" >&2
  echo "Checked: $BUILT_BIN" >&2
  echo "Run install_sosearch.sh first, or use the bundled binary build." >&2
  exit 1
fi

if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "SoSearch already running on pid $(cat "$PID_FILE")"
  exit 0
fi

nohup env PORT="$PORT" "$BIN" >"$LOG_FILE" 2>&1 &
echo $! >"$PID_FILE"
sleep 2

echo "Started SoSearch on http://localhost:$PORT"
echo "Binary: $BIN"
echo "PID: $(cat "$PID_FILE")"
echo "Log: $LOG_FILE"
