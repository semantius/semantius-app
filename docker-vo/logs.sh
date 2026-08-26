#!/usr/bin/env bash
# Follow container logs. Run from anywhere. Ctrl-C to stop following.
set -euo pipefail
cd "$(dirname "$0")/.."   # repo root
exec docker compose -f docker-vo/docker-compose.yml logs -f "$@"
