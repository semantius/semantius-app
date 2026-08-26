#!/usr/bin/env bash
# Stop the container but KEEP it, so it can be restarted quickly with
# docker-vo/start.sh (or `docker start semantius-app`). To delete it entirely,
# use docker-vo/delete.sh. Run from anywhere.
set -euo pipefail
cd "$(dirname "$0")/.."   # repo root
exec docker compose -f docker-vo/docker-compose.yml stop "$@"
