#!/usr/bin/env bash
# Pull and run the PUBLISHED image from GHCR (no build). Run from anywhere.
# Pin a release tag with TAG (default: latest):  TAG=v1.2.3 docker/start-published.sh
set -euo pipefail
cd "$(dirname "$0")/.."   # repo root
docker compose -f docker/docker-compose.ghcr.yml up -d --pull always "$@"
echo "semantius-app (published ${TAG:-latest}) is running → http://localhost:${WEB_PORT:-7070}"
