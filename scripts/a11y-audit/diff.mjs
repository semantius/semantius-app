#!/usr/bin/env node
/**
 * Diff two audit runs by criterion, then by finding.
 *
 *   node scripts/a11y-audit/diff.mjs [baseline.json] [run.json]
 *
 * Defaults: the committed baseline, and the newest `*-after-fixes.json`. The
 * baseline measured only 390 and 1440, so the like-for-like numbers are the
 * "at the baseline viewports" ones; the full-matrix counts include five
 * viewports the baseline never saw. A criterion whose count ROSE is not a
 * regression until the per-finding section says which findings are new and
 * on which views — the first post-fix run's rise in 1.4.3 was 58 new dark-mode
 * placeholder findings (a real regression) plus axe findings on views that
 * turned out to be error cards (a harness gap), and only this view told them apart.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'a11y-reports')
const [baseArg = '20260905T122344-baseline.json', runArg] = process.argv.slice(2)
const runName = runArg ?? readdirSync(DIR).filter((f) => /-after-fixes\.json$/.test(f)).sort().pop()
if (!runName) { console.error('no *-after-fixes.json in a11y-reports/'); process.exit(2) }
const base = JSON.parse(readFileSync(join(DIR, baseArg), 'utf8'))
const run = JSON.parse(readFileSync(join(DIR, runName), 'utf8'))

const rank = { 'Does Not Support': 0, 'Partially Supports': 1, 'Not Evaluated': 2, 'Not Applicable': 3, 'Supports': 4 }
const baseVp = (base.meta.viewports ?? []).map((v) => ` @ ${v} /`)
const atBaseVp = (f) => baseVp.some((v) => String(f.where ?? '').includes(v))
const text = (f) => f.help ?? f.detail ?? f.message ?? f.description ?? JSON.stringify(f)
const key = (f) => `${f.where} :: ${text(f).slice(0, 90)}${f.targets ? ' :: ' + JSON.stringify(f.targets).slice(0, 70) : ''}`

console.log(`BASE ${baseArg}: ${base.meta.url}  viewports=${base.meta.viewports}`)
console.log(`RUN  ${runName}: ${run.meta.url}  viewports=${run.meta.viewports}  generated=${run.meta.generatedAt}`)
console.log(`summary base=${JSON.stringify(base.summary)}`)
console.log(`summary run =${JSON.stringify(run.summary)}`)
console.log(`cantTell: base=${(base.cantTell ?? base.inconclusive).length} run=${(run.cantTell ?? run.inconclusive).length}`)
for (const i of run.cantTell ?? run.inconclusive) console.log(`   cantTell ${i.where}: ${i.reasons.join('; ')}`)

console.log('\nBy criterion (counts at the baseline viewports in brackets):')
const byId = new Map(base.criteria.map((c) => [c.id, c]))
for (const c of run.criteria) {
  const b = byId.get(c.id)
  if (!b) continue
  const bs = b.status, ns = c.status
  const bf = b.failures.filter(atBaseVp).length, nf = c.failures.filter(atBaseVp).length
  let mark = ''
  if (rank[ns] > rank[bs]) mark = 'IMPROVED'
  else if (rank[ns] < rank[bs]) mark = 'REGRESSED'
  else if (ns === 'Partially Supports' || ns === 'Does Not Support') mark = nf < bf ? 'fewer' : nf > bf ? 'MORE' : 'same'
  if (mark) console.log(`  ${mark.padEnd(9)} ${c.id.padEnd(7)} ${c.level.padEnd(3)} ${c.name.padEnd(34)} ${bs} [${bf}] -> ${ns} [${nf}]  (full matrix: ${c.failures.length})`)
}

console.log('\nPer finding, at the baseline viewports:')
for (const c of run.criteria) {
  const b = byId.get(c.id)
  if (!b || (c.status !== 'Partially Supports' && c.status !== 'Does Not Support')) continue
  const bs = new Set(b.failures.filter(atBaseVp).map(key)), ns = new Set(c.failures.filter(atBaseVp).map(key))
  const added = [...ns].filter((k) => !bs.has(k)), gone = [...bs].filter((k) => !ns.has(k))
  console.log(`\n  ${c.id} ${c.name}: baseline ${bs.size}, run ${ns.size}; gone ${gone.length}, added ${added.length}`)
  const summarize = (list, label) => {
    if (list.length === 0) return
    const byMsg = {}
    for (const k of list) { const m = k.split(' :: ')[1]; byMsg[m] = (byMsg[m] || 0) + 1 }
    console.log(`    ${label}:`)
    for (const [m, n] of Object.entries(byMsg).sort((x, y) => y[1] - x[1]).slice(0, 6)) console.log(`      ${String(n).padStart(3)}  ${m}`)
  }
  summarize(gone, 'gone')
  summarize(added, 'ADDED')
  if (added.length) {
    const views = {}
    for (const k of added) { const w = k.split(' :: ')[0]; views[w] = (views[w] || 0) + 1 }
    console.log('    added on:', Object.entries(views).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([w, n]) => `${w} (${n})`).join('; '))
  }
}
