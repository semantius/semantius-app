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
  messageIndex,
  reactivateLocale,
  resolveClickTarget,
  scanAndMark,
  setMissingCount,
  setRecordingRenders,
  splitScopedId,
  subscribeToCatalog,
  translatedKeys,
  useLanguage,
  useT,
  useTranslateModeFlags,
  type TranslationEntry,
} from '@/i18n'
import { EditorDialog, type EditorRequest } from './EditorDialog'
import { Panel } from './Panel'
import './translateMode.css'

/**
 * How long a burst of DOM mutations is allowed to settle before one scan runs
 * over it. A route change is hundreds of mutations; one scan is enough.
 */
const SCAN_DELAY_MS = 150

export interface TranslateModeProps {
  /** Mark untranslated text. */
  marking: boolean
  /** The full mode: marks, Alt+click editing, the panel. */
  editing: boolean
}

/**
 * Translate mode, mounted by `components/TranslateModeHost.tsx` while either
 * switch is on — and loaded lazily by it, so this chunk (with the `en-US.json`
 * index it imports) never reaches a browser that is not translating.
 *
 * Three pieces, all driven by the render-time reverse index
 * (`src/i18n/reverseIndex.ts`):
 *
 *   marking   a MutationObserver over the document, throttled, re-scanning
 *             text nodes and the scanned attributes and painting CSS Custom
 *             Highlights over the ones whose id has no translation;
 *   editing   Alt+click on any text our own functions produced opens the
 *             editor for it — Alt, so a plain click still opens the menu or
 *             follows the link the text is on;
 *   the panel the whole catalog, the model labels, the export.
 *
 * In the source language nothing is marked (nothing is missing there) and the
 * editor offers an override instead.
 */
export default function TranslateMode({ marking, editing }: TranslateModeProps) {
  const t = useT()
  const language = useLanguage()
  const isSource = language === SOURCE_LANGUAGE
  const version = useSyncExternalStore(subscribeToCatalog, catalogSnapshot, catalogSnapshot)
  const { missingCount } = useTranslateModeFlags()
  const [present, setPresent] = useState<ReadonlySet<string>>(() => new Set())
  const [request, setRequest] = useState<EditorRequest | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)

  // Record renders for as long as this is mounted. The re-activation is what
  // re-renders every `useT()` consumer and `useLocalizedMetadata` memo, so the
  // index fills with what is on screen rather than waiting for the next change.
  useEffect(() => {
    setRecordingRenders(true)
    void reactivateLocale()
    return () => {
      setRecordingRenders(false)
      clearMarks()
      setMissingCount(0)
    }
  }, [])

  // Say how to use it, once, to whoever just switched it on. A plain click
  // still opens the menu or follows the link the text is on — which is the
  // right behavior and the reason nothing on screen reveals the editor.
  useEffect(() => {
    if (!editing || !consumeJustEnabled()) return
    toast.info(t('Translate mode is on'), {
      description: t('Alt+click any text to translate it where it stands, or open the Translations panel.'),
      duration: 8000,
    })
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

  // The count the Language submenu shows: every index message without a
  // translation, plus every model label on the page without one.
  useEffect(() => {
    if (isSource) {
      setMissingCount(0)
      return
    }
    const keys = translatedKeys(language)
    let count = 0
    for (const id of Object.keys(messageIndex().index)) if (!keys.has(id)) count++
    for (const id of present) if (splitScopedId(id) && !keys.has(id)) count++
    setMissingCount(count)
    // `version` stands in for the key set, which changes with it.
  }, [language, isSource, present, version])

  // Alt+click anywhere: resolve what was clicked and open the editor for it.
  useEffect(() => {
    if (!editing) return
    const onClick = (event: MouseEvent) => {
      if (!event.altKey) return
      const hit = resolveClickTarget(event)
      if (!hit) return
      event.preventDefault()
      event.stopPropagation()
      const entries = hit.ids
        .map(entryForId)
        .filter((entry): entry is TranslationEntry => entry !== undefined)
      if (entries.length > 0) setRequest({ entries })
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [editing])

  return (
    <>
      {editing && (
        <Button
          type="button"
          size="sm"
          data-i18n-ui=""
          // The only place the Alt+click gesture is permanently written down.
          title={t('Alt+click any text to translate it where it stands.')}
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
