#!/usr/bin/env bash
# Stop AND delete the container (and its compose network). The image is kept.
# Works whether the container was started local or published (same project).
# Run from anywhere.
set -euo pipefail
cd "$(dirname "$0")/.."   # repo root
exec docker compose -f docker-vo/docker-compose.yml down "$@"
