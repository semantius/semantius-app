import { CRITERIA, PASSING_STATUSES, REVIEW_ONLY, STATUS, tagToCriterion } from './criteria.mjs'

/**
 * Pivots raw per-view measurements into `criterion -> { status, routes, evidence }`.
 *
 * The pivot itself is bookkeeping over data the axe payload already carries (it
 * tags every rule with its success criteria); what matters is the rules applied
 * on top:
 *
 *   1. A criterion with no evidence is Not Evaluated. Never Supports.
 *   2. A criterion whose only evidence came from `cantTell` views is Not
 *      Evaluated — an unmeasurable page is not a passing page.
 *   3. The four review-only criteria stay Not Evaluated until a human signs the
 *      emitted evidence off, no matter how clean the automated signal looks.
 */

const NON_TEXT_MIN = 3
const TEXT_MIN = 4.5

export function buildReport({ meta, views }) {
  const measured = views.filter((s) => s.measured)
  const cantTell = views.filter((s) => !s.measured)

  /** criterion id -> { failures: [], passes: number, evidence: [] } */
  const acc = new Map()
  const bucket = (id) => {
    if (!acc.has(id)) acc.set(id, { failures: [], evidence: [], observedIn: new Set() })
    return acc.get(id)
  }

  for (const view of measured) {
    const where = `${view.route.id} @ ${view.viewport.name} / ${view.theme}`

    // --- axe ---
    if (view.axe && !view.axe.error) {
      const covered = new Set()
      for (const v of view.axe.violations ?? []) {
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
      for (const id of view.axeCoverage ?? []) {
        bucket(id).observedIn.add(where)
        if (!covered.has(id)) continue
      }
    }

    // --- 2.4.2 Page Titled (per-route title presence; uniqueness handled below)
    if (view.structure && !view.structure.error) {
      const s = view.structure
      bucket('2.4.2').observedIn.add(where)
      if (!s.title || s.title.trim() === '') {
        bucket('2.4.2').failures.push({ where, detail: 'empty <title>' })
      }

      // 1.3.1 / 2.4.6 heading structure. axe's page-has-heading-one is a
      // best-practice rule and therefore outside the AA tag set this audit runs,
      // which is exactly why it is checked here instead.
      bucket('1.3.1').observedIn.add(where)
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
        bucket('2.4.1').observedIn.add(where)
        if (!s.skipLink) {
          bucket('2.4.1').failures.push({ where, detail: 'first focusable element is not a skip link' })
        } else if (!s.skipLink.targetExists) {
          bucket('2.4.1').failures.push({ where, detail: `skip link targets ${s.skipLink.href}, which does not exist` })
        }
      }

      bucket('3.1.1').observedIn.add(where)
      if (!s.lang) bucket('3.1.1').failures.push({ where, detail: '<html> has no lang attribute' })

      bucket('1.1.1').evidence.push({ where, images: s.images })
      bucket('2.4.6').evidence.push({ where, headings: s.headings })
      bucket('4.1.3').evidence.push({ where, liveRegions: s.liveRegions })
    }

    // --- 1.4.10 Reflow ---
    if (view.overflow && !view.overflow.error) {
      bucket('1.4.10').observedIn.add(where)
      if (view.overflow.offenders.length > 0) {
        bucket('1.4.10').failures.push({
          where,
          detail: `${view.overflow.offenders.length} element(s) extend past the ${view.overflow.viewportWidth}px viewport with no scrollable ancestor`,
          offenders: view.overflow.offenders.slice(0, 5),
        })
      }
    }

    // --- 1.4.3 placeholder text (invisible to axe) ---
    if (view.placeholder && !view.placeholder.error) {
      bucket('1.4.3').observedIn.add(where)
      for (const r of view.placeholder.results) {
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
    if (view.controls && !view.controls.error && (view.controls.controlsFound ?? 0) > 0) {
      bucket('1.4.11').observedIn.add(where)
      bucket('2.4.7').observedIn.add(where)
      for (const b of view.controls.boundary) {
        const worst = b.vsFill === null ? b.vsOutside : Math.min(b.vsOutside, b.vsFill)
        if (worst < NON_TEXT_MIN) {
          bucket('1.4.11').failures.push({
            where,
            detail: `${b.element} boundary is ${worst}:1 (outside ${b.vsOutside}, fill ${b.vsFill ?? 'n/a'})`,
          })
        }
      }
      if (view.controls.indicator.length === 0) {
        const refused = view.controls.unfocusable ?? []
        const sampled = view.controls.sampled ?? Math.min(view.controls.controlsFound, 12)
        if (refused.length > 0 && refused.length === sampled) {
          // Nothing was measured: every sampled control refused focus — a modal
          // trapping it, an inert subtree. That is "could not look", not "no
          // indicator", and it must not read as a 2.4.7 failure (it did once:
          // all 14 findings of one run were this). Not observed here; the
          // refusal is kept as evidence so a human can see where the probe was
          // blind. Runs before this distinction have no `unfocusable` field and
          // keep their failures.
          bucket('2.4.7').observedIn.delete(where)
          bucket('2.4.7').evidence.push({
            where,
            detail: `not measured: ${refused.length} sampled control(s) refused focus (${refused.slice(0, 3).join(', ')})`,
          })
        } else {
          bucket('2.4.7').failures.push({
            where,
            detail: `${view.controls.controlsFound} control(s) present but none produced a measurable focus indicator` +
              (refused.length ? `; ${refused.length} of ${sampled} sampled refused focus` : ''),
          })
        }
      }
      for (const i of view.controls.indicator) {
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
    if (view.focusObscured && !view.focusObscured.error) {
      bucket('2.4.11').observedIn.add(where)
      for (const o of view.focusObscured.obscured) {
        bucket('2.4.11').failures.push({
          where,
          detail: `${o.element} ("${o.text}") is covered by ${o.blockers.join(', ')} when focused`,
        })
      }
    }

    // --- 2.4.3 raw material ---
    if (view.tabOrder && !view.tabOrder.error) {
      bucket('2.4.3').evidence.push({ where, order: view.tabOrder.order })
    }

    // --- 1.3.4 Orientation: the landscape viewport is the whole point ---
    if (view.viewport.name.includes('landscape')) {
      bucket('1.3.4').observedIn.add(where)
    }
  }

  // --- 2.4.2 title uniqueness, which is a property of the SET, not of a page ---
  const titlesByRoute = new Map()
  for (const view of measured) {
    const title = view.structure?.title
    if (!title) continue
    // The audit runs signed in, so a route that redirects an authenticated user
    // away (e.g. /login -> /) reports the destination's title. That is not a
    // duplicate title, it is a route this run never actually rendered.
    if (view.route.unauthenticated) continue
    if (!titlesByRoute.has(view.route.id)) titlesByRoute.set(view.route.id, new Set())
    titlesByRoute.get(view.route.id).add(title)
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
    let note = 'No automated check in this audit covers this criterion.'

    // `observedIn` is a SET of views, not a counter. It used to be incremented
    // once per PROBE that touched the criterion, so a criterion two probes speak
    // to reported twice the views that exist — 3.1.1 claimed 440 of a 224-view
    // set. A denominator larger than the view set is not a rounding error; it
    // makes every coverage number in the report unreadable.
    const observed = data ? data.observedIn.size : 0
    if (data && observed > 0) {
      if (data.failures.length === 0) {
        status = STATUS.SUPPORTS
        note = `Checked in ${observed} of ${measured.length} views with no failures.`
      } else {
        const failingViews = new Set(data.failures.map((f) => f.where)).size
        status = failingViews >= observed ? STATUS.FAILS : STATUS.PARTIAL
        note = `${data.failures.length} finding(s) across ${failingViews} of ${observed} views.`
      }
    } else if (data && data.evidence.length > 0) {
      note = 'Evidence emitted for review; no automated pass condition exists.'
    }

    if (REVIEW_ONLY[c.id]) {
      // Rule 3: never let emitted evidence read as a pass.
      status = STATUS.NOT_EVALUATED
      note = REVIEW_ONLY[c.id]
    }

    if (PASSING_STATUSES.has(status) && cantTell.length > 0 && observed === 0) {
      status = STATUS.NOT_EVALUATED
      note = 'Only cantTell views produced evidence for this criterion.'
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
      views: views.length,
      measuredViews: measured.length,
      cantTellViews: cantTell.length,
    },
    summary: {
      counts,
      // The gate. `cantTell` is not a pass, so a view that could not be
      // measured fails the run just as a violation does.
      pass:
        cantTell.length === 0 &&
        criteria.every((c) => c.status !== STATUS.FAILS && c.status !== STATUS.PARTIAL),
    },
    cantTell: cantTell.map((c) => ({
      where: `${c.route.id} @ ${c.viewport.name} / ${c.theme}`,
      reasons: c.cantTellReasons,
    })),
    routeTitles,
    criteria,
  }
}

/** Human-readable digest, printed after a run and easy to paste into a PR. */
export function formatSummary(report) {
  const lines = []
  lines.push(`Accessibility audit — ${report.meta.url}`)
  lines.push(
    `${report.meta.measuredViews}/${report.meta.views} views measured` +
      (report.meta.cantTellViews ? `, ${report.meta.cantTellViews} cantTell` : ''),
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
