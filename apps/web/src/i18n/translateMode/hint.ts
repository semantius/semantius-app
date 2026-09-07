import { msg } from '@/i18n'

/**
 * The gesture, in one place, because it is said in three: the toast when the
 * mode starts, the floating button's tooltip and the panel.
 *
 * Right-click leads because it is what a person tries first and it needs no
 * keyboard. Its own module rather than a const in `index.tsx`, which the panel
 * would then have to import back out of its own parent.
 *
 * A `msg()` descriptor, not a bare string: the extractor accepts an identifier
 * as an argument to `t()` only because its `msg()` site is extracted elsewhere,
 * so a plain `const HINT = '…'` would pass the check and never reach a catalog —
 * untranslated forever, silently.
 */
export const EDIT_HINT = msg('Right-click or Alt+click any text to translate it where it stands.')
