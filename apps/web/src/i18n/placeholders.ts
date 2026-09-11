/**
 * ICU placeholders, as the running app checks them.
 *
 * The same walk `scripts/i18n/extract.mjs` does over Lingui's compiled tokens
 * — `src/i18n/placeholders.test.ts` pins the two together over the whole
 * index — so a translation typed into translate mode is held to exactly the
 * rule `import.mjs` and the catalog test apply: every placeholder of the source
 * present, none invented. The script cannot be imported here (it reads the
 * file system), which is why the walk is spelled twice.
 */

import { compileMessageOrThrow, type CompiledMessage } from '@lingui/message-utils/compileMessage'

/** The argument names of an ICU message, sorted. Throws on a message that does not compile. */
export function placeholdersOf(message: string): string[] {
  const names = new Set<string>()
  const walk = (tokens: readonly unknown[]) => {
    for (const token of tokens) {
      if (typeof token === 'string' || !Array.isArray(token)) continue
      const [name, , format] = token as [string, string?, unknown?]
      names.add(name)
      if (format && typeof format === 'object' && !Array.isArray(format)) {
        for (const [key, choice] of Object.entries(format as Record<string, unknown>)) {
          if (key === 'offset' || !Array.isArray(choice)) continue
          walk(choice)
        }
      }
    }
  }
  const compiled: CompiledMessage = compileMessageOrThrow(message)
  walk(Array.isArray(compiled) ? compiled : [compiled])
  return [...names].sort()
}

/** The compiler's complaint about `text`, or null when it compiles. */
export function compileError(text: string): string | null {
  try {
    compileMessageOrThrow(text)
    return null
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

export interface PlaceholderDiff {
  /** In the source, not in the translation — data that would vanish on screen. */
  missing: string[]
  /** In the translation, not in the source — would render as literal braces. */
  extra: string[]
}

/**
 * How `translation`'s placeholders differ from `source`'s; null when they
 * agree, or when either does not compile (the compile check reports that).
 */
export function placeholderDiff(source: string, translation: string): PlaceholderDiff | null {
  let expected: string[]
  let actual: string[]
  try {
    expected = placeholdersOf(source)
    actual = placeholdersOf(translation)
  } catch {
    return null
  }
  const missing = expected.filter((name) => !actual.includes(name))
  const extra = actual.filter((name) => !expected.includes(name))
  return missing.length > 0 || extra.length > 0 ? { missing, extra } : null
}
