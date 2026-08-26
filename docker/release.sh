#!/usr/bin/env bash
# Cut a release: bump the version, tag it, push the tag.
#
# Pushing the tag is the entire trigger. .github/workflows/docker-publish.yml then
# builds the multi-arch image, pushes it to ghcr.io/<owner>/semantius-app AND creates
# the GitHub Release. Nothing is built or pushed locally here.
#
# The git tag is the single source of truth for a version: the image tags
# (0.1.2 / 0.1 / latest) are derived from it by docker/metadata-action. Nothing in the
# app reads package.json's "version" — it is bumped here only so the repo does not
# claim a version it isn't at.
#
# Usage: docker/release.sh v0.1.3 [-y]
set -euo pipefail
cd "$(dirname "$0")/.."

die() { printf 'release: %s\n' "$*" >&2; exit 1; }

VERSION="${1:-}"
[ -n "$VERSION" ] || die "usage: docker/release.sh vX.Y.Z [-y]"

ASSUME_YES=0
case "${2:-}" in
  -y|--yes) ASSUME_YES=1 ;;
  "") ;;
  *) die "unknown option: $2" ;;
esac

# Plain vX.Y.Z only. A prerelease (v1.0.0-rc.1) would still pick up the `latest` image
# tag from the workflow's unconditional type=raw rule, which would be wrong.
[[ "$VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "version must look like v1.2.3 (got '$VERSION')"
NUMBER="${VERSION#v}"

git fetch --quiet --tags origin

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[ "$BRANCH" != "HEAD" ] || die "detached HEAD — check out a branch first"

git diff --quiet && git diff --cached --quiet \
  || die "uncommitted changes to tracked files — commit or stash first"

UPSTREAM="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null)" \
  || die "branch '$BRANCH' has no upstream — push it first"
[ "$(git rev-parse HEAD)" = "$(git rev-parse '@{u}')" ] \
  || die "HEAD differs from $UPSTREAM — push/pull first; the tag must point at a commit the remote has"

# Note: `cmd && die` would abort the script under `set -e` when cmd fails, so both
# existence checks are written as explicit ifs.
if git rev-parse -q --verify "refs/tags/$VERSION" >/dev/null 2>&1; then
  die "tag $VERSION already exists locally"
fi
if [ -n "$(git ls-remote --tags origin "refs/tags/$VERSION")" ]; then
  die "tag $VERSION already exists on origin"
fi

LATEST="$(git tag --list 'v*' | sort -V | tail -1)"
if [ -n "$LATEST" ] && [ "$(printf '%s\n%s\n' "$LATEST" "$VERSION" | sort -V | tail -1)" != "$VERSION" ]; then
  die "$VERSION is not newer than the latest tag $LATEST"
fi

pkg_version() { sed -n 's/^  "version": "\(.*\)",$/\1/p' package.json | head -1; }
CURRENT="$(pkg_version)"

printf '\n  release    %s\n  commit     %s  %s\n  branch     %s (in sync with %s)\n  version    package.json %s -> %s\n  publishes  ghcr.io image :%s :%s :latest  + GitHub Release %s\n\n' \
  "$VERSION" "$(git rev-parse --short HEAD)" "$(git log -1 --format=%s)" \
  "$BRANCH" "$UPSTREAM" "${CURRENT:-?}" "$NUMBER" "$NUMBER" "${NUMBER%.*}" "$VERSION"

if [ "$ASSUME_YES" -eq 0 ] && [ -t 0 ]; then
  read -r -p "proceed? [y/N] " reply
  case "$reply" in y|Y|yes|YES) ;; *) die "aborted" ;; esac
fi

if [ "$CURRENT" != "$NUMBER" ]; then
  # Surgical edit of the first `  "version": "…",` line: a JSON round-trip would
  # reformat the whole file.
  sed -i "0,/^  \"version\": \".*\",$/s//  \"version\": \"$NUMBER\",/" package.json
  [ "$(pkg_version)" = "$NUMBER" ] || die "failed to bump package.json (still '$(pkg_version)')"
  git add package.json
  git commit -q -m "chore(release): $VERSION"
  git push -q origin "$BRANCH"
  echo "bumped package.json to $NUMBER and pushed chore(release): $VERSION"
fi

# Annotated (-a), not lightweight: releases should carry a tagger and a message.
git tag -a "$VERSION" -m "Release $VERSION"
git push origin "$VERSION"

ORIGIN="$(git remote get-url origin)"
case "$ORIGIN" in
  *github.com*)
    REPO="$(printf '%s' "$ORIGIN" | sed -E 's#^(git@github\.com:|https://github\.com/)##; s#\.git$##')"
    printf '\npushed %s — CI is building. Verify:\n  actions  https://github.com/%s/actions/workflows/docker-publish.yml\n  release  https://github.com/%s/releases/tag/%s\n  image    https://github.com/%s/pkgs/container/%s\n' \
      "$VERSION" "$REPO" "$REPO" "$VERSION" "$REPO" "${REPO#*/}"
    ;;
  *) printf '\npushed %s to %s\n' "$VERSION" "$ORIGIN" ;;
esac
