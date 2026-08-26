#!/usr/bin/env bash
# Tag the current commit and push the tag (triggers .github/workflows/docker-publish.yml).
# Usage: docker-vo/release.sh v0.1.0
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="$1"
git tag "$VERSION"
git push origin "$VERSION"
