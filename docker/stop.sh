#!/usr/bin/env bash
# Stop the container but KEEP it, so it can be restarted quickly with
# docker/start.sh (or `docker start semantius-app`). To delete it entirely,
# use docker/delete.sh. Run from anywhere.
set -euo pipefail
cd "$(dirname "$0")/.."   # repo root
exec docker compose -f docker/docker-compose.yml stop "$@"
