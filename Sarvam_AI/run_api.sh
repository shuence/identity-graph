#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
PORT="${PORT:-8001}"
PY="${PWD}/.venv312/bin/python"
if [[ ! -x "$PY" ]]; then
  echo "Create venv first: /opt/homebrew/opt/python@3.12/bin/python3.12 -m venv .venv312"
  echo "Then: .venv312/bin/pip install -r requirements.txt"
  exit 1
fi
exec "$PY" -m uvicorn api:app --host 127.0.0.1 --port "$PORT" --reload
