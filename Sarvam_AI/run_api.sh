#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
PORT="${PORT:-8001}"

if [[ -x "${PWD}/.venv312/bin/python" ]]; then
  PY="${PWD}/.venv312/bin/python"
elif [[ -x "${PWD}/.venv/bin/python" ]]; then
  PY="${PWD}/.venv/bin/python"
else
  echo "Create venv first:"
  echo "  python3 -m venv .venv && .venv/bin/pip install -r requirements.txt"
  exit 1
fi

echo "Starting IdentityGraph API on http://127.0.0.1:${PORT} (python: $PY)"
exec "$PY" -m uvicorn api:app --host 127.0.0.1 --port "$PORT" --reload
