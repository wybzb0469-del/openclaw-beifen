#!/usr/bin/env bash
set -euo pipefail

PID_FILE="${SOSEARCH_PID_FILE:-$HOME/.openclaw/workspace/sosearch-server.pid}"

if [ ! -f "$PID_FILE" ]; then
  echo "No PID file found. Nothing to stop."
  exit 0
fi

PID="$(cat "$PID_FILE")"
if kill -0 "$PID" 2>/dev/null; then
  kill "$PID"
  echo "Stopped SoSearch pid $PID"
else
  echo "Process $PID not running"
fi

rm -f "$PID_FILE"
