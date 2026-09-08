import { useEffect, useState, useSyncExternalStore } from 'react'
import { Languages } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  SCANNED_ATTRIBUTES,
  SOURCE_LANGUAGE,
  catalogSnapshot,
  clearMarks,
  consumeJustEnabled,
  entryForId,
  loadSourceIndex,
  reactivateLocale,
  resolveClickTarget,
  scanAndMark,
  setMissingCount,
  setRecordingRenders,
  sourceIndexSnapshot,
  sourceIndexVersion,
  subscribeToCatalog,
  subscribeToSourceIndex,
  translatedKeys,
  useLanguage,
  useT,
  useTranslateModeFlags,
  type TranslationEntry,
} from '@/i18n'
import { EditorDialog, type EditorRequest } from './EditorDialog'
import { EDIT_HINT } from './hint'
import { Panel } from './Panel'
import './translateMode.css'

/**
 * How long a burst of DOM mutations is allowed to settle before one scan runs
 * over it. A route change is hundreds of mutations; one scan is enough.
 */
const SCAN_DELAY_MS = 150

/**
 * Whether the hint has been shown in this page's lifetime. Module state in the
 * lazy chunk, so it survives the component unmounting (switching the mode off
 * and on again does not re-teach) and dies with the page (a reload does).
 */
let hintShown = false

export interface TranslateModeProps {
  /** Mark untranslated text. */
  marking: boolean
  /** The full mode: marks, in-context editing, the panel. */
  editing: boolean
}

/**
 * Translate mode, mounted by `components/TranslateModeHost.tsx` while either
 * switch is on — and loaded lazily by it, so this chunk (the editor, the panel
 * and the highlighter) never reaches a browser that is not translating.
 *
 * Three pieces, all driven by the render-time reverse index
 * (`src/i18n/reverseIndex.ts`):
 *
 *   marking   a MutationObserver over the document, throttled, re-scanning
 *             text nodes and the scanned attributes and painting CSS Custom
 *             Highlights over the ones whose key has no translation;
 *   editing   right-click or Alt+click on any text our own functions produced
 *             opens the editor for it; a plain click is left alone so it still
 *             opens the menu or follows the link the text sits on;
 *   the panel the whole index — code strings and model text alike — with its
 *             filters, and what is on this page.
 *
 * In the source language nothing is marked (nothing is missing there) and the
 * editor offers an override where the target keeps one.
 */
export default function TranslateMode({ marking, editing }: TranslateModeProps) {
  const t = useT()
  const language = useLanguage()
  const isSource = language === SOURCE_LANGUAGE
  const version = useSyncExternalStore(subscribeToCatalog, catalogSnapshot, catalogSnapshot)
  const indexVersion = useSyncExternalStore(subscribeToSourceIndex, sourceIndexVersion, sourceIndexVersion)
  const { missingCount } = useTranslateModeFlags()
  const [present, setPresent] = useState<ReadonlySet<string>>(() => new Set())
  const [request, setRequest] = useState<EditorRequest | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)

  // Record renders for as long as this is mounted. The re-activation is what
  // re-renders every `useT()` consumer and `useLocalizedMetadata` memo, so the
  // index fills with what is on screen rather than waiting for the next change.
  // The source index is what the count and the panel measure against.
  useEffect(() => {
    setRecordingRenders(true)
    void reactivateLocale()
    void loadSourceIndex()
    return () => {
      setRecordingRenders(false)
      clearMarks()
      setMissingCount(0)
    }
  }, [])

  // Say how to use it, once per page load — not only to whoever flipped the
  // switch. The switch persists, so a reload would otherwise leave somebody
  // staring at marked text with no idea what opens it, which is exactly what
  // happened: a plain click still opens the menu or follows the link the text
  // is on, and nothing on screen reveals the editor.
  useEffect(() => {
    if (!editing || hintShown) return
    hintShown = true
    consumeJustEnabled()
    toast.info(t('Translate mode is on'), { description: t(EDIT_HINT), duration: 10000 })
  }, [editing, t])

  // Scan on every settled burst of mutations, and whenever the catalog changes
  // (a save, a language switch) — the second covers a mark that a save resolved
  // without the text itself changing.
  const mark = (marking || editing) && !isSource
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const run = () => {
      timer = undefined
      const keys = translatedKeys(language)
      const result = scanAndMark({ root: document.body, mark, isMissing: (id) => !keys.has(id) })
      setPresent((previous) => (sameSet(previous, result.present) ? previous : result.present))
    }
    const schedule = () => {
      if (timer === undefined) timer = setTimeout(run, SCAN_DELAY_MS)
    }
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...SCANNED_ATTRIBUTES],
    })
    const unsubscribe = subscribeToCatalog(schedule)
    schedule()
    return () => {
      observer.disconnect()
      unsubscribe()
      if (timer !== undefined) clearTimeout(timer)
      clearMarks()
    }
  }, [language, mark])

  // The count the Language submenu shows: every key in the index without a
  // translation, plus what is on this page that the index has not caught up
  // with yet — a string discovered this session.
  useEffect(() => {
    if (isSource) {
      setMissingCount(0)
      return
    }
    const keys = translatedKeys(language)
    const index = sourceIndexSnapshot()
    let count = 0
    if (index) for (const id of index.keys()) if (!keys.has(id)) count++
    for (const id of present) if (!index?.has(id) && !keys.has(id)) count++
    setMissingCount(count)
    // `version` and `indexVersion` stand in for the key set and the index,
    // which change with them.
  }, [language, isSource, present, version, indexVersion])

  // Two gestures, because one of them is undiscoverable on its own.
  //
  //   right-click  what a person actually tries, and it needs no keyboard. It
  //                costs the browser's own context menu while the mode is on,
  //                which is a fair trade for an explicit, opt-in editing mode —
  //                and only over text this app produced: anywhere else, and
  //                inside translate mode's own UI, the native menu still opens.
  //   Alt+click    for a pointer whose right button is spoken for, and because
  //                a plain click has to keep opening the menu or following the
  //                link the text sits on.
  useEffect(() => {
    if (!editing) return
    const open = (event: MouseEvent) => {
      const hit = resolveClickTarget(event)
      if (!hit) return
      const index = sourceIndexSnapshot()
      const entries = hit.ids
        .map((id) => entryForId(id, index))
        .filter((entry): entry is TranslationEntry => entry !== undefined)
      if (entries.length === 0) return
      event.preventDefault()
      event.stopPropagation()
      setRequest({ entries })
    }
    const onClick = (event: MouseEvent) => {
      if (event.altKey) open(event)
    }
    document.addEventListener('click', onClick, true)
    document.addEventListener('contextmenu', open, true)
    return () => {
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('contextmenu', open, true)
    }
  }, [editing])

  return (
    <>
      {editing && (
        <Button
          type="button"
          size="sm"
          data-i18n-ui=""
          title={t(EDIT_HINT)}
          className="fixed right-4 bottom-4 z-40 shadow-lg"
          onClick={() => setPanelOpen(true)}
        >
          <Languages />
          {t('Translations')}
          {missingCount > 0 && (
            <span className="rounded-full bg-background/20 px-1.5 text-xs" aria-hidden="true">
              {missingCount}
            </span>
          )}
          <span className="sr-only">
            {t('{count, plural, one {# missing translation} other {# missing translations}}', { count: missingCount })}
          </span>
        </Button>
      )}
      {editing && (
        <Panel
          open={panelOpen}
          onOpenChange={setPanelOpen}
          language={language}
          presentIds={present}
          onEdit={(entry) => setRequest({ entries: [entry] })}
        />
      )}
      <EditorDialog request={request} language={language} onClose={() => setRequest(null)} />
    </>
  )
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false
  for (const id of a) if (!b.has(id)) return false
  return true
}
