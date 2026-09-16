import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { compare, parse, isHighest } from './latest-tag.mjs'

// node:test, not vitest: this lives outside apps/web, which is the vitest
// root, and the guard job runs it with the node already on the runner — the
// workflow proves its own comparator before trusting it to assign `latest`.
const cmp = (a, b) => compare(parse(a), parse(b))

describe('semver precedence', () => {
  it('orders the core version numerically, not lexically', () => {
    assert.equal(cmp('v0.10.0', 'v0.9.0'), 1)
    assert.equal(cmp('v0.2.9', 'v0.2.10'), -1)
  })

  it('ranks a pre-release below its own release', () => {
    assert.equal(cmp('v1.0.0-rc.1', 'v1.0.0'), -1)
  })

  it('ranks a pre-release ABOVE any lower core version', () => {
    // The whole point: 0.5.0-beta.1 is newer than 0.4.0, so it takes latest.
    assert.equal(cmp('v0.5.0-beta.1', 'v0.4.0'), 1)
    assert.equal(cmp('v0.5.0-beta.1', 'v0.4.9'), 1)
  })

  it('compares pre-release identifiers by the spec, not as strings', () => {
    assert.equal(cmp('v1.0.0-rc.9', 'v1.0.0-rc.10'), -1) // numeric, not "9" > "10"
    assert.equal(cmp('v1.0.0-1', 'v1.0.0-alpha'), -1) // numeric below alphanumeric
    assert.equal(cmp('v1.0.0-alpha', 'v1.0.0-beta'), -1) // ASCII
    assert.equal(cmp('v1.0.0-alpha', 'v1.0.0-alpha.1'), -1) // longer run ranks higher
  })

  it('walks the spec own example chain', () => {
    const chain = [
      'v1.0.0-alpha', 'v1.0.0-alpha.1', 'v1.0.0-alpha.beta',
      'v1.0.0-beta', 'v1.0.0-beta.2', 'v1.0.0-beta.11', 'v1.0.0-rc.1', 'v1.0.0',
    ]
    for (let i = 1; i < chain.length; i++) {
      assert.equal(cmp(chain[i - 1], chain[i]), -1, `${chain[i - 1]} < ${chain[i]}`)
    }
  })

  it('ignores build metadata and tolerates a missing v', () => {
    assert.ok(parse('0.2.9'))
    assert.ok(parse('v0.2.9-rc.1'))
  })

  it('refuses anything that is not a version tag', () => {
    for (const bad of ['vendor-x', 'v-old', 'latest', 'v1.0', 'v1.0.0.0']) {
      assert.equal(parse(bad), undefined, bad)
    }
  })
})

describe('isHighest', () => {
  const tags = ['v0.4.0', 'v0.4.1', 'v0.5.0-beta.1', 'vendor-x', 'v-old']

  it('refuses latest to a backport cut after a higher pre-release', () => {
    // The case this script exists for.
    assert.equal(isHighest('v0.4.1', tags), false)
  })

  it('gives latest to the highest version, pre-release or not', () => {
    assert.equal(isHighest('v0.5.0-beta.1', tags), true)
    assert.equal(isHighest('v0.5.0', [...tags, 'v0.5.0']), true)
  })

  it('is true when this is the only tag', () => {
    assert.equal(isHighest('v0.1.0', ['v0.1.0']), true)
  })

  it('ignores tags that are not versions', () => {
    assert.equal(isHighest('v0.1.0', ['v0.1.0', 'vendor-x', 'v-old', 'nightly']), true)
  })

  it('is true for the tag comparing equal to itself', () => {
    assert.equal(isHighest('v0.5.0-beta.1', ['v0.5.0-beta.1']), true)
  })
})
