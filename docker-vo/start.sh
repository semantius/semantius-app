#!/usr/bin/env bash
# Start the container in the background. Does NOT rebuild — it runs the existing
# semantius-app:local image (compose builds it only if it doesn't exist yet).
# After code changes, rebuild explicitly with docker-vo/build.sh. Run from anywhere.
set -euo pipefail
cd "$(dirname "$0")/.."   # repo root (Docker build context)
docker compose -f docker-vo/docker-compose.yml up -d "$@"
echo "semantius-app-vo (Caddy variant) is running → http://localhost:${WEB_PORT:-7071}"
