import { useT } from '@/i18n'
import { MAIN_CONTENT_ID } from './landmarks'

/**
 * 2.4.1 Bypass Blocks.
 *
 * The app puts a sidebar with every module, every app and every bookmark ahead
 * of the page content in DOM order. Without this, reaching the first thing on
 * the page by keyboard costs a tab stop per navigation item, on every route.
 *
 * It must be the FIRST focusable element in the document, and it must become
 * visible when focused — `sr-only` alone would be a link nobody can see they
 * have landed on. `focus:not-sr-only` undoes the clip; the explicit positioning
 * is needed because `not-sr-only` restores `position: static`, which would let
 * the link push the header down as it appears.
 *
 * A plain `<a href="#…">` rather than a router `<Link>`: the target is on the
 * page already, and routing to it would remount the very content we are
 * skipping to.
 */
export function SkipLink() {
  const t = useT()

  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:outline-2 focus:outline-offset-2 focus:outline-ring focus:shadow-lg"
    >
      {t('Skip to main content')}
    </a>
  )
}
