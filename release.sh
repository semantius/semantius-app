#!/usr/bin/env bash
# Cut a release: bump the version, tag it, push the tag.
#
# Pushing the tag is the entire trigger. `.github/workflows/docker-publish.yml`
# then builds the multi-arch image, pushes it to ghcr.io/<owner>/semantius-app
# and creates the GitHub Release. Nothing is built or pushed locally here.
#
# The git tag is the source of truth for a version — the image tags
# (0.1.3 / 0.1 / latest / sha-<commit>) are derived from it by
# `docker/metadata-action`. `package.json` is bumped here because the publish
# workflow's `guard` job **refuses a tag that disagrees with it**: nothing in
# the SPA reports its version at runtime, so the tag is the only record of what
# a given image contains, and a tree claiming one version while the tag claims
# another makes that record a lie. That is not hypothetical — v0.1.1 and v0.1.2
# were both cut from a tree that said 0.1.0, because the bump did not exist yet
# and nothing checked.
#
# It lives at the repository root, not in `docker/`: nothing here builds or
# pushes an image — this bumps one file, commits, tags and pushes, and the tag
# is the whole trigger — so `docker/` was a place nobody looked. Same reasoning
# as `semantius-idp`'s root `release.sh`, which this tracks closely.
#
# Two deliberate differences from that sibling:
#
#   * **one file is bumped**, not three. `apps/web/package.json` is private and
#     pinned at 0.0.0 — a placeholder nothing reads — and there is no runtime
#     version fallback to keep in step. Bumping it would be ceremony.
#   * **no CHANGELOG preview.** This repository has no CHANGELOG.md, so the
#     release body is GitHub's generated notes (`generate_release_notes`).
#
# Usage: ./release.sh vX.Y.Z[-pre] [-y]
set -euo pipefail
cd "$(dirname "$0")"

die() { printf 'release: %s\n' "$*" >&2; exit 1; }

VERSION="${1:-}"
[ -n "$VERSION" ] || die "usage: ./release.sh vX.Y.Z[-pre] [-y]"

ASSUME_YES=0
case "${2:-}" in
  -y|--yes) ASSUME_YES=1 ;;
  "") ;;
  *) die "unknown option: $2" ;;
esac

# The same grammar the workflow's `guard` job enforces, checked here so the
# refusal arrives before the tag is pushed rather than a minute after.
[[ "$VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]] \
  || die "version must look like v1.2.3 or v1.2.3-rc.1 (got '$VERSION')"
NUMBER="${VERSION#v}"
CORE="${NUMBER%%-*}"
PRERELEASE=0
[ "$NUMBER" != "$CORE" ] && PRERELEASE=1

git fetch --quiet --tags origin

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[ "$BRANCH" != "HEAD" ] || die "detached HEAD — check out a branch first"

git diff --quiet && git diff --cached --quiet \
  || die "uncommitted changes to tracked files — commit or stash first"

UPSTREAM="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null)" \
  || die "branch '$BRANCH' has no upstream — push it first"
[ "$(git rev-parse HEAD)" = "$(git rev-parse '@{u}')" ] \
  || die "HEAD differs from $UPSTREAM — push/pull first; the tag must point at a commit the remote has"

# `cmd && die` would abort under `set -e` when cmd fails, so both existence
# checks are explicit ifs.
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

# Advisory only. It cannot gate — `gh` may be absent, a run may still be in
# flight — but a previous publish that failed is worth seeing before a new tag
# is stacked on top of it.
CI="not checked (gh not on PATH)"
if command -v gh >/dev/null 2>&1; then
  CI="$(gh run list --commit "$(git rev-parse HEAD)" --limit 5 \
        --json workflowName,conclusion,status \
        --jq '[.[] | "\(.workflowName)=\(.conclusion // .status)"] | join(" ")' 2>/dev/null)" \
    || CI="not checked (gh call failed)"
  [ -n "$CI" ] || CI="no runs recorded for this commit"
fi

# Mirror the workflow's tag rules exactly, or this preview is a plan that
# quietly disagrees with what gets published:
#   * a pre-release takes only its own version and the sha — metadata-action
#     skips {{major}}.{{minor}} and `latest` for one;
#   * `{{major}}` is suppressed while the major version is zero. That is
#     metadata-action's own default ("Docker tag 0 should not be generated"),
#     not something the workflow opts into, so `:0` must not be promised here.
#
# No concrete `sha-<commit>` either: the bump below adds a commit, so the tag
# lands on something this line cannot yet name.
MAJOR="${CORE%%.*}"
if [ "$PRERELEASE" -eq 1 ]; then
  IMAGE_TAGS=":$NUMBER :sha-<commit> only (pre-release: no ${CORE%.*}, no latest)"
elif [ "$MAJOR" = "0" ]; then
  IMAGE_TAGS=":$NUMBER :${CORE%.*} :latest :sha-<commit>  (no :0 — major version zero)"
else
  IMAGE_TAGS=":$NUMBER :${CORE%.*} :$MAJOR :latest :sha-<commit>"
fi

printf '\n  release    %s%s\n  commit     %s  %s\n  branch     %s (in sync with %s)\n  version    package.json %s -> %s\n  ci         %s\n  notes      generated by GitHub from the commits since %s\n  publishes  ghcr.io/<owner>/semantius-app %s\n             + GitHub Release %s, amd64 and arm64\n\n' \
  "$VERSION" "$([ "$PRERELEASE" -eq 1 ] && printf '  (pre-release)')" \
  "$(git rev-parse --short HEAD)" "$(git log -1 --format=%s)" \
  "$BRANCH" "$UPSTREAM" "${CURRENT:-?}" "$CORE" \
  "$CI" "${LATEST:-the first commit}" "$IMAGE_TAGS" "$VERSION"

if [ "$ASSUME_YES" -eq 0 ] && [ -t 0 ]; then
  read -r -p "proceed? [y/N] " reply
  case "$reply" in y|Y|yes|YES) ;; *) die "aborted" ;; esac
fi

# The workflow compares the tag's `X.Y.Z` against package.json, so a
# pre-release bumps to the core version and not to `0.2.0-rc.1`.
if [ "$CURRENT" != "$CORE" ]; then
  # Surgical edit of the first `  "version": "…",` line: a JSON round-trip
  # would reformat the whole file. Verified, because a silent no-op here is a
  # tag the workflow refuses.
  sed -i "0,/^  \"version\": \".*\",$/s//  \"version\": \"$CORE\",/" package.json
  [ "$(pkg_version)" = "$CORE" ] || die "failed to bump package.json (still '$(pkg_version)')"
  git add package.json
  git commit -q -m "chore(release): $VERSION"
  git push -q origin "$BRANCH"
  echo "bumped package.json to $CORE and pushed chore(release): $VERSION"
fi

# Signed if this machine is set up to sign, annotated if not.
#
# The fallback matters more than it looks: by this point the bump commit has
# already been **pushed**. A configured-but-unusable key — locked agent, gpg
# missing, a key that lives on the other machine — would abort here under
# `set -e` and leave the branch bumped and the release untagged, which is the
# one state that needs a human to unpick. So a failed `-s` degrades to `-a`
# and says so, rather than stranding the release half-made.
if [ -n "$(git config user.signingkey || true)" ] || [ "$(git config tag.gpgsign || true)" = "true" ]; then
  if git tag -s "$VERSION" -m "Release $VERSION" 2>/dev/null; then
    echo "tagged $VERSION (signed)"
  else
    git tag -a "$VERSION" -m "Release $VERSION"
    echo "tagged $VERSION (annotated — signing was configured but failed; re-tag by hand if a signature is required)"
  fi
else
  git tag -a "$VERSION" -m "Release $VERSION"
  echo "tagged $VERSION (annotated; no signing key configured)"
fi
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
