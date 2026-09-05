import * as React from "react"

/**
 * Mobile breakpoint, expressed the way Tailwind expresses it.
 *
 * Tailwind's `md:` is `48rem`, not `768px`. Those are the same number only while
 * the root font size is the browser default 16px — a user who raises their
 * default text size (a 1.4.4 accommodation, and a common one) moves `48rem` while
 * a hardcoded `768` stays put. The two then disagree: this hook says "desktop"
 * and hands back the desktop sidebar while every `md:` utility on the page is
 * still in its mobile state, or the reverse.
 *
 * Expressed in rem, and read through matchMedia so it tracks changes to the root
 * font size and to the viewport alike.
 */
const MOBILE_BREAKPOINT_REM = 48

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    // `not all and (min-width: 48rem)` is the precise negation of Tailwind's
    // md: query, which avoids the off-by-one that any `max-width` formulation
    // introduces at fractional device pixel ratios.
    const mql = window.matchMedia(`not all and (min-width: ${MOBILE_BREAKPOINT_REM}rem)`)
    const onChange = (event: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(event.matches)
    }
    mql.addEventListener("change", onChange)
    onChange(mql)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}

export { MOBILE_BREAKPOINT_REM }
