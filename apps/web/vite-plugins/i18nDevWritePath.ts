/**
 * The translate endpoint's path, in a module with NO imports.
 *
 * Both the dev-server plugin and the browser need this string, and the plugin
 * pulls in `node:fs` — so importing it from client code would drag node
 * built-ins into the bundle. A bare constant module is the whole fix.
 *
 * It is the PostgREST table path on purpose: the client calls exactly this in
 * dev and in production, and only the BASE url differs.
 */
export const TRANSLATIONS_PATH = '/ui_translations'
