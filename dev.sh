#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

command -v npm >/dev/null || { echo "请先安装 Node.js 22"; exit 1; }
command -v uv >/dev/null || { echo "请先安装 uv"; exit 1; }

[[ -f .env ]] || cp .env.example .env
[[ -x node_modules/.bin/concurrently ]] || npm install
[[ -x apps/api/.venv/bin/python ]] || uv sync --project apps/api

exec npm run dev
