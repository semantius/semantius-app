import * as React from "react"

/**
 * `min-width` media query, in rem, the way Tailwind expresses its breakpoints
 * (`md:` is 48rem, `lg:` is 64rem). In rem rather than px for the reason
 * `useIsMobile` gives: a raised root font size moves every `md:`/`lg:` utility
 * on the page, and a hook in px would stop agreeing with them.
 *
 * Answers `false` on the first render (matchMedia is read in an effect), so
 * anything derived from it must be CONTROLLED state, never `initialState` —
 * see the columnPinning note in CONTEXT-MEMORY.md.
 */
export function useMinWidth(rem: number): boolean {
  const [matches, setMatches] = React.useState(false)

  React.useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${rem}rem)`)
    const onChange = (event: MediaQueryListEvent | MediaQueryList) => {
      setMatches(event.matches)
    }
    mql.addEventListener("change", onChange)
    onChange(mql)
    return () => mql.removeEventListener("change", onChange)
  }, [rem])

  return matches
}

/**
 * The narrowest viewport at which the data grid pins columns. Tailwind `lg:`.
 *
 * Pinning switched on at `md:` (48rem) and that was measured to be too early:
 * at 768px the sidebar leaves a 480px grid container, and the pinned set —
 * 100px id + 220px label on the left, 50px actions on the right — takes 370 of
 * them. `scroll-padding` then reserves 370px and leaves a 110px band, which
 * cannot fit a 156px column-title button; focusing one leaves it entirely
 * under the pinned columns (2.4.11, twelve findings at 768 and 844×390 in one
 * audit run). At `lg:` the container is ~736px and the band is ~366px.
 */
export const GRID_PINNING_MIN_WIDTH_REM = 64
