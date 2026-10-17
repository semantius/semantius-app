/**
 * The modules whose model text belongs in the repository's language files.
 *
 * `i18n/*.json` ship with the app to EVERY deployment, so they may only hold
 * text every deployment has: the code strings, and the model text of modules
 * that come with the platform. Any other module is one tenant's own model —
 * its labels exist on that tenant and nowhere else, so recording them here
 * ships one customer's vocabulary to all of them and leaves keys no other
 * screen will ever render. Their translations belong in that tenant's
 * `/translations` record (`prod` mode), not in a PR.
 *
 * Discovery used to record whatever it rendered. The test suite renders the
 * module list of the SHARED test tenant, and `pnpm dev` renders whatever a
 * developer opens, so every module anyone had created there — equipment
 * maintenance, SaaS spend management, a probe — landed in `en-US.json` with an
 * empty entry in every language.
 *
 * Keyed by the module's SLUG (the second segment of a `module.*` key), not its
 * name: `_core` is the module NAME, `admin` its slug.
 *
 * Applied by the collector (`./missing.ts`): a key outside these modules is
 * skipped, not recorded.
 *
 * Adding a module here is a decision that it ships with the platform.
 */
export const SHIPPED_MODULES: ReadonlySet<string> = new Set([
  'admin', // `_core`: users, roles, permissions, modules, entities, fields
  'nwind', // the Northwind sample database every tenant is provisioned with
])

/** The first segment of every model key — `MODULE_ROOT` in `./catalog.ts`. */
const MODULE_PREFIX = 'module.'

/**
 * Whether `key` may be written to the repository's language files: any code
 * key, and a model key only under a shipped module.
 */
export function isShippedKey(key: string): boolean {
  if (!key.startsWith(MODULE_PREFIX)) return true
  const slug = key.slice(MODULE_PREFIX.length).split('.', 1)[0]
  return SHIPPED_MODULES.has(slug)
}
