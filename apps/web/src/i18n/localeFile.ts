/**
 * The file <-> rows mapping, as the app sees it.
 *
 * A re-export, not a second implementation: the mapping itself lives in
 * `scripts/i18n/localeFile.mjs` as plain ESM, because the node scripts that move
 * a language between a file and the tenant's table run under bare `node` with
 * nothing transpiling TypeScript. One implementation, two runtimes — a hand-kept
 * copy on this side is exactly the divergence that would make an export and an
 * import disagree about a key.
 *
 * This file exists so app code imports through `@/i18n` like everything else,
 * and so the reason above is written down where someone would otherwise "tidy"
 * the mapping into TypeScript.
 */

export {
  applyRowToFile,
  emptyLocaleFile,
  localeFileToRows,
  parseLabelKey,
  rowsToLocaleFiles,
  COLUMN_LABEL_ATTRIBUTES as FILE_COLUMN_LABEL_ATTRIBUTES,
  LABEL_SCOPES as FILE_LABEL_SCOPES,
  MODULE_LABEL_ATTRIBUTES,
  TABLE_LABEL_ATTRIBUTES,
  TRANSLATION_SCOPES,
} from '../../scripts/i18n/localeFile.mjs'

export type { TranslationRow, ParsedLabelKey } from '../../scripts/i18n/localeFile.mjs'
