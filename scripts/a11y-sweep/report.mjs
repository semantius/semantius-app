import { CRITERIA, PASSING_STATUSES, REVIEW_ONLY, STATUS, tagToCriterion } from './criteria.mjs'

/**
 * Pivots raw per-cell measurements into `criterion -> { status, routes, evidence }`.
 *
 * The pivot itself is bookkeeping over data the axe payload already carries (it
 * tags every rule with its success criteria); what matters is the rules applied
 * on top:
 *
 *   1. A criterion with no evidence is Not Evaluated. Never Supports.
 *   2. A criterion whose only evidence came from INCONCLUSIVE cells is Not
 *      Evaluated — an unmeasurable page is not a passing page.
 *   3. The four review-only criteria stay Not Evaluated until a human signs the
 *      emitted evidence off, no matter how clean the automated signal looks.
 */

const NON_TEXT_MIN = 3
const TEXT_MIN = 4.5

export function buildReport({ meta, cells }) {
  const admissible = cells.filter((c) => c.admissible)
  const inconclusive = cells.filter((c) => !c.admissible)

  /** criterion id -> { failures: [], passes: number, evidence: [] } */
  const acc = new Map()
  const bucket = (id) => {
    if (!acc.has(id)) acc.set(id, { failures: [], evidence: [], observed: 0 })
    return acc.get(id)
  }

  for (const cell of admissible) {
    const where = `${cell.route.id} @ ${cell.viewport.name} / ${cell.theme}`

    // --- axe ---
    if (cell.axe && !cell.axe.error) {
      const covered = new Set()
      for (const v of cell.axe.violations ?? []) {
        for (const tag of v.tags) {
          const id = tagToCriterion(tag)
          if (!id) continue
          covered.add(id)
          bucket(id).failures.push({
            where,
            rule: v.id,
            impact: v.impact,
            help: v.help,
            nodes: v.nodeCount,
            targets: v.nodes.map((n) => n.target).slice(0, 3),
          })
        }
      }
      // axe reports the criteria it *ran* for, not only the ones it failed, via
      // its rule set. Count coverage for each criterion any rule in the tag set
      // touches, so "ran clean" is distinguishable from "never looked".
      for (const id of cell.axeCoverage ?? []) {
        bucket(id).observed += 1
        if (!covered.has(id)) continue
      }
    }

    // --- 2.4.2 Page Titled (per-route title presence; uniqueness handled below)
    if (cell.structure && !cell.structure.error) {
      const s = cell.structure
      bucket('2.4.2').observed += 1
      if (!s.title || s.title.trim() === '') {
        bucket('2.4.2').failures.push({ where, detail: 'empty <title>' })
      }

      // 1.3.1 / 2.4.6 heading structure. axe's page-has-heading-one is a
      // best-practice rule and therefore outside the AA tag set this sweep runs,
      // which is exactly why it is checked here instead.
      bucket('1.3.1').observed += 1
      if (s.modalOpen) {
        // The page behind an open modal is inert, so its <h1> is correctly hidden
        // from this probe. What has to be named here is the dialog, and it is —
        // by its own title. Demanding an <h1> inside a dialog would be wrong.
        if (!s.modalName) {
          bucket('1.3.1').failures.push({ where, detail: 'a modal is open but has no accessible name' })
        }
      } else if (s.h1Count === 0) {
        bucket('1.3.1').failures.push({ where, detail: 'no <h1> on the page' })
      } else if (s.h1Count > 1) {
        bucket('1.3.1').failures.push({ where, detail: `${s.h1Count} <h1> elements` })
      }
      let previous = 0
      for (const h of s.headings) {
        if (previous && h.level > previous + 1) {
          bucket('1.3.1').failures.push({
            where,
            detail: `heading level jumps h${previous} -> h${h.level} ("${h.text}")`,
          })
        }
        previous = h.level
      }

      // 2.4.1 Bypass Blocks. axe's own `bypass` rule PASSES a page that merely
      // has a <main>, so it cannot answer whether a skip link exists.
      //
      // Only pages that HAVE a repeated block need one. The standalone pages
      // (sign-in, signed-out, 404) render no navigation at all, so there is
      // nothing to bypass and a skip link would be a link to nowhere useful.
      const hasNav = s.landmarks.some((l) => l.tag === 'nav' || l.role === 'navigation')
      if (hasNav && !s.modalOpen) {
        bucket('2.4.1').observed += 1
        if (!s.skipLink) {
          bucket('2.4.1').failures.push({ where, detail: 'first focusable element is not a skip link' })
        } else if (!s.skipLink.targetExists) {
          bucket('2.4.1').failures.push({ where, detail: `skip link targets ${s.skipLink.href}, which does not exist` })
        }
      }

      bucket('3.1.1').observed += 1
      if (!s.lang) bucket('3.1.1').failures.push({ where, detail: '<html> has no lang attribute' })

      bucket('1.1.1').evidence.push({ where, images: s.images })
      bucket('2.4.6').evidence.push({ where, headings: s.headings })
      bucket('4.1.3').evidence.push({ where, liveRegions: s.liveRegions })
    }

    // --- 1.4.10 Reflow ---
    if (cell.overflow && !cell.overflow.error) {
      bucket('1.4.10').observed += 1
      if (cell.overflow.offenders.length > 0) {
        bucket('1.4.10').failures.push({
          where,
          detail: `${cell.overflow.offenders.length} element(s) extend past the ${cell.overflow.viewportWidth}px viewport with no scrollable ancestor`,
          offenders: cell.overflow.offenders.slice(0, 5),
        })
      }
    }

    // --- 1.4.3 placeholder text (invisible to axe) ---
    if (cell.placeholder && !cell.placeholder.error) {
      bucket('1.4.3').observed += 1
      for (const r of cell.placeholder.results) {
        if (r.ratio < TEXT_MIN) {
          bucket('1.4.3').failures.push({
            where,
            detail: `::placeholder "${r.placeholder}" is ${r.ratio}:1 on ${r.element}`,
          })
        }
      }
    }

    // --- 1.4.11 boundary + 2.4.7 / 1.4.11 focus indicator ---
    // A route with no form controls has nothing to say about either criterion.
    // Counting it as "observed" and then failing it for producing no indicator
    // turns "nothing to look at" into a finding.
    if (cell.controls && !cell.controls.error && (cell.controls.controlsFound ?? 0) > 0) {
      bucket('1.4.11').observed += 1
      bucket('2.4.7').observed += 1
      for (const b of cell.controls.boundary) {
        const worst = b.vsFill === null ? b.vsOutside : Math.min(b.vsOutside, b.vsFill)
        if (worst < NON_TEXT_MIN) {
          bucket('1.4.11').failures.push({
            where,
            detail: `${b.element} boundary is ${worst}:1 (outside ${b.vsOutside}, fill ${b.vsFill ?? 'n/a'})`,
          })
        }
      }
      if (cell.controls.indicator.length === 0) {
        bucket('2.4.7').failures.push({
          where,
          detail: `${cell.controls.controlsFound} control(s) present but none produced a measurable focus indicator`,
        })
      }
      for (const i of cell.controls.indicator) {
        const worst = Math.min(i.vsOutside, i.vsFill)
        if (worst < NON_TEXT_MIN) {
          bucket('1.4.11').failures.push({
            where,
            detail: `focus indicator on ${i.element} is ${worst}:1 (${i.source})`,
          })
          bucket('2.4.7').failures.push({
            where,
            detail: `focus indicator on ${i.element} is ${worst}:1 (${i.source})`,
          })
        }
      }
    }

    // --- 2.4.11 Focus Not Obscured ---
    if (cell.focusObscured && !cell.focusObscured.error) {
      bucket('2.4.11').observed += 1
      for (const o of cell.focusObscured.obscured) {
        bucket('2.4.11').failures.push({
          where,
          detail: `${o.element} ("${o.text}") is covered by ${o.blockers.join(', ')} when focused`,
        })
      }
    }

    // --- 2.4.3 raw material ---
    if (cell.tabOrder && !cell.tabOrder.error) {
      bucket('2.4.3').evidence.push({ where, order: cell.tabOrder.order })
    }

    // --- 1.3.4 Orientation: the landscape viewport is the whole point ---
    if (cell.viewport.name.includes('landscape')) {
      bucket('1.3.4').observed += 1
    }
  }

  // --- 2.4.2 title uniqueness, which is a property of the SET, not of a page ---
  const titlesByRoute = new Map()
  for (const cell of admissible) {
    const title = cell.structure?.title
    if (!title) continue
    // The sweep runs signed in, so a route that redirects an authenticated user
    // away (e.g. /login -> /) reports the destination's title. That is not a
    // duplicate title, it is a route this run never actually rendered.
    if (cell.route.unauthenticated) continue
    if (!titlesByRoute.has(cell.route.id)) titlesByRoute.set(cell.route.id, new Set())
    titlesByRoute.get(cell.route.id).add(title)
  }
  const routeTitles = [...titlesByRoute.entries()].map(([routeId, titles]) => ({
    routeId,
    titles: [...titles],
  }))
  const seen = new Map()
  for (const { routeId, titles } of routeTitles) {
    for (const t of titles) {
      if (!seen.has(t)) seen.set(t, [])
      seen.get(t).push(routeId)
    }
  }
  for (const [title, routeIds] of seen) {
    if (routeIds.length > 1) {
      bucket('2.4.2').failures.push({
        where: routeIds.join(', '),
        detail: `${routeIds.length} routes share the title "${title}"`,
      })
    }
  }

  // --- resolve statuses ---
  const criteria = CRITERIA.map((c) => {
    const data = acc.get(c.id)
    let status = STATUS.NOT_EVALUATED
    let note = 'No automated check in this sweep covers this criterion.'

    if (data && data.observed > 0) {
      if (data.failures.length === 0) {
        status = STATUS.SUPPORTS
        note = `Checked in ${data.observed} route/viewport/theme cells with no failures.`
      } else {
        const failingCells = new Set(data.failures.map((f) => f.where)).size
        status = failingCells >= data.observed ? STATUS.FAILS : STATUS.PARTIAL
        note = `${data.failures.length} finding(s) across ${failingCells} of ${data.observed} cells.`
      }
    } else if (data && data.evidence.length > 0) {
      note = 'Evidence emitted for review; no automated pass condition exists.'
    }

    if (REVIEW_ONLY[c.id]) {
      // Rule 3: never let emitted evidence read as a pass.
      status = STATUS.NOT_EVALUATED
      note = REVIEW_ONLY[c.id]
    }

    if (PASSING_STATUSES.has(status) && inconclusive.length > 0 && data?.observed === 0) {
      status = STATUS.NOT_EVALUATED
      note = 'Only inconclusive cells produced evidence for this criterion.'
    }

    return {
      ...c,
      status,
      note,
      failures: data?.failures ?? [],
      evidenceCount: data?.evidence.length ?? 0,
      evidence: data?.evidence ?? [],
    }
  })

  const counts = criteria.reduce((out, c) => {
    out[c.status] = (out[c.status] ?? 0) + 1
    return out
  }, {})

  return {
    meta: {
      ...meta,
      generatedAt: new Date().toISOString(),
      cells: cells.length,
      admissibleCells: admissible.length,
      inconclusiveCells: inconclusive.length,
    },
    summary: {
      counts,
      // The gate. INCONCLUSIVE is not a pass, so an inadmissible cell fails the
      // run just as a violation does.
      pass:
        inconclusive.length === 0 &&
        criteria.every((c) => c.status !== STATUS.FAILS && c.status !== STATUS.PARTIAL),
    },
    inconclusive: inconclusive.map((c) => ({
      where: `${c.route.id} @ ${c.viewport.name} / ${c.theme}`,
      reasons: c.inadmissibleReasons,
    })),
    routeTitles,
    criteria,
  }
}

/** Human-readable digest, printed after a run and easy to paste into a PR. */
export function formatSummary(report) {
  const lines = []
  lines.push(`Accessibility sweep — ${report.meta.url}`)
  lines.push(
    `${report.meta.admissibleCells}/${report.meta.cells} cells admissible` +
      (report.meta.inconclusiveCells ? `, ${report.meta.inconclusiveCells} INCONCLUSIVE` : ''),
  )
  lines.push('')
  for (const [status, n] of Object.entries(report.summary.counts)) {
    lines.push(`  ${String(n).padStart(3)}  ${status}`)
  }
  lines.push('')
  const problems = report.criteria.filter(
    (c) => c.status === STATUS.FAILS || c.status === STATUS.PARTIAL,
  )
  if (problems.length === 0) {
    lines.push('No criterion reports a failure.')
  } else {
    lines.push('Failing criteria:')
    for (const c of problems) {
      lines.push(`  ${c.id} ${c.name} (${c.level}) — ${c.status}: ${c.note}`)
      for (const f of c.failures.slice(0, 4)) {
        lines.push(`      ${f.where}: ${f.detail ?? `${f.rule} — ${f.help}`}`)
      }
      if (c.failures.length > 4) lines.push(`      … ${c.failures.length - 4} more`)
    }
  }
  const notEvaluated = report.criteria.filter((c) => c.status === STATUS.NOT_EVALUATED)
  lines.push('')
  lines.push(`${notEvaluated.length} criteria are Not Evaluated (not a pass): ${notEvaluated.map((c) => c.id).join(', ')}`)
  return lines.join('\n')
}
