#!/usr/bin/env bash
# Build the runtime-configurable image. Run from anywhere.
set -euo pipefail
cd "$(dirname "$0")/.."   # repo root (Docker build context)
exec docker compose -f docker-vo/docker-compose.yml build "$@"
