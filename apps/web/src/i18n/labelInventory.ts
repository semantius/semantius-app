/**
 * What the MODEL says needs translating, as the app sees it.
 *
 * A re-export, not a second implementation — the same arrangement as
 * `./localeFile.ts`, and for the same reason: `scripts/i18n/labels.mjs` and
 * `translate.mjs` compute this inventory under bare `node`, where nothing
 * transpiles TypeScript, and an inventory that disagreed between the panel and
 * the script would tell a translator a language was complete when it was not.
 *
 * The one fact both sides spell independently is the runtime id format
 * (`scope:key`, `scopedId()` here and `idOf()` there); `labelInventory.test.ts`
 * pins them together by building a diff through `flattenLabels`.
 */

export {
  buildLabelInventory,
  diffLabelInventory,
  parseEnumValues,
} from '../../scripts/i18n/labelInventory.mjs'

export type {
  InventoryEntry,
  InventoryDiff,
  OrphanedEntry,
  ModelRows,
  TableRow,
  FieldRow,
  ModuleRow,
} from '../../scripts/i18n/labelInventory.mjs'
