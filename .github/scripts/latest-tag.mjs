#!/usr/bin/env node
/**
 * Does the given version outrank every other release tag in this repository?
 *
 * `docker/metadata-action` cannot answer this: it only ever sees the ref being
 * built, so anything derived there is really "the tag being pushed", and a
 * backport cut after a higher tag (v0.4.1 landing after v0.5.0-beta.1) would
 * take `latest` BACKWARDS. This compares against every tag in the checkout —
 * which includes the one just pushed — so `latest` means the highest version.
 *
 * Precedence is SemVer §11, implemented rather than approximated:
 *   - major, minor, patch numerically;
 *   - a version WITH a pre-release ranks BELOW the same core without one;
 *   - pre-release identifiers left to right, numeric numerically, alphanumeric
 *     by ASCII, numeric below alphanumeric, and a longer run of otherwise
 *     equal identifiers ranks above a shorter one;
 *   - build metadata (+…) is ignored entirely.
 *
 * `git tag --sort=v:refname` is NOT this: its version sort has no concept of
 * pre-release precedence unless every suffix is enumerated in
 * `versionsort.suffix`, which silently mis-sorts the first suffix nobody listed.
 *
 * Usage:  node latest-tag.mjs <version> [<all-versions-newline-separated>]
 * Prints `true` or `false`. With no second argument it reads `git tag`.
 */
import { execFileSync } from 'node:child_process'

const RELEASE = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/

export function parse(tag) {
  const m = RELEASE.exec(tag.trim())
  if (!m) return undefined
  return {
    core: [Number(m[1]), Number(m[2]), Number(m[3])],
    pre: m[4] === undefined ? undefined : m[4].split('.'),
  }
}

/** -1, 0 or 1 — SemVer precedence. */
export function compare(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a.core[i] !== b.core[i]) return a.core[i] < b.core[i] ? -1 : 1
  }
  // 1.0.0-rc < 1.0.0. Absence of a pre-release ranks HIGHER.
  if (a.pre === undefined && b.pre === undefined) return 0
  if (a.pre === undefined) return 1
  if (b.pre === undefined) return -1

  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i]
    const y = b.pre[i]
    // A longer run of otherwise equal identifiers ranks higher.
    if (x === undefined) return -1
    if (y === undefined) return 1
    if (x === y) continue
    const xNum = /^\d+$/.test(x)
    const yNum = /^\d+$/.test(y)
    if (xNum && yNum) return Number(x) < Number(y) ? -1 : 1
    // Numeric identifiers always rank below alphanumeric ones.
    if (xNum !== yNum) return xNum ? -1 : 1
    return x < y ? -1 : 1
  }
  return 0
}

export function isHighest(version, allTags) {
  const mine = parse(version)
  if (!mine) throw new Error(`not a version: ${version}`)
  return allTags
    .map(parse)
    .filter(Boolean)
    .every((other) => compare(mine, other) >= 0)
}

// Not when imported by the test beside it.
if (process.argv[1] && process.argv[1].endsWith('latest-tag.mjs')) {
  const version = process.argv[2]
  const supplied = process.argv[3]
  const tags = (supplied ?? execFileSync('git', ['tag'], { encoding: 'utf8' }))
    .split('\n')
    .filter(Boolean)
  process.stdout.write(String(isHighest(version, tags)))
}
