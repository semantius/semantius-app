import { useEffect, useMemo, useRef } from 'react'
import { Download, Trash2, Upload } from 'lucide-react'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupText } from '@/components/ui/input-group'
import { formatByteSize } from '@/lib/number-format'
import { useFormattingLocale, useT } from '@/i18n'

export interface FileInputProps {
  /** Id of the control that the field's `<FormLabel htmlFor>` points at. */
  id: string
  /** The field's current contents, already decoded. */
  bytes?: Uint8Array
  /** Name to offer the download as. */
  downloadName: string
  disabled?: boolean
  readOnly?: boolean
  /** A required field offers no Clear: emptying it could not then be saved. */
  required?: boolean
  invalid?: boolean
  /** Id of the field's `<FormLabel>`, for naming the icon-only buttons. */
  labelledBy?: string
  describedBy?: string
  onSelect: (file: File) => void
  onClear: () => void
}

/**
 * A file field built from the same `InputGroup` surface as every other control.
 *
 * The native `<input type="file">` is unstyleable and its button carries the
 * browser's own text in the browser's own language, so it is hidden and driven
 * from a real `InputGroupButton` that carries the field's `id` — which is what
 * the `<FormLabel htmlFor>` points at, so clicking the label opens the picker.
 *
 * There is no hidden `<input value>` mirroring the contents: a 5 MB hex string
 * in the DOM is 10 MB of markup, and nothing reads it. The form holds the value.
 */
export function FileInput({
  id,
  bytes,
  downloadName,
  disabled,
  readOnly,
  required,
  invalid,
  labelledBy,
  describedBy,
  onSelect,
  onClear,
}: FileInputProps) {
  const t = useT()
  const locale = useFormattingLocale()
  const fileRef = useRef<HTMLInputElement>(null)
  const uploadRef = useRef<HTMLButtonElement>(null)

  // A blob URL is a document-scoped resource: without the revoke it leaks for
  // the lifetime of the page, once per edit.
  const href = useMemo(
    () => (bytes && bytes.length > 0 ? URL.createObjectURL(new Blob([bytes as BlobPart])) : undefined),
    [bytes],
  )
  useEffect(() => {
    if (!href) return
    return () => URL.revokeObjectURL(href)
  }, [href])

  const locked = disabled || readOnly

  return (
    <InputGroup data-invalid={invalid || undefined} data-disabled={locked || undefined}>
      <InputGroupAddon align="inline-start">
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const file = e.target.files?.[0]
            // Reset so choosing the same file twice still fires a change.
            e.target.value = ''
            if (file) onSelect(file)
          }}
        />
        <InputGroupButton
          ref={uploadRef}
          id={id}
          size="icon-xs"
          disabled={locked}
          aria-labelledby={labelledBy ? `${labelledBy} ${id}-upload` : undefined}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          onClick={() => fileRef.current?.click()}
        >
          <Upload aria-hidden="true" />
          <span id={`${id}-upload`} className="sr-only">
            {t('Choose a file')}
          </span>
        </InputGroupButton>
      </InputGroupAddon>

      {/* The only place the field's contents are described, so it announces on
          its own when a file is chosen or cleared. */}
      <InputGroupText aria-live="polite" className="flex-1 truncate px-1">
        {bytes && bytes.length > 0 ? formatByteSize(bytes.length, locale) : t('No file')}
      </InputGroupText>

      <InputGroupAddon align="inline-end">
        {href && (
          <a
            href={href}
            download={downloadName}
            onClick={(e) => e.stopPropagation()}
            className="flex size-6 items-center justify-center rounded-xl hover:bg-accent [&>svg]:size-3.5"
          >
            <Download aria-hidden="true" />
            <span className="sr-only">{t('Download the file')}</span>
          </a>
        )}
        {bytes && bytes.length > 0 && !required && !locked && (
          <InputGroupButton
            size="icon-xs"
            aria-label={t('Remove the file')}
            onClick={() => {
              onClear()
              // Focus would otherwise land on <body>: this button unmounts with
              // the value it clears.
              uploadRef.current?.focus()
            }}
          >
            <Trash2 aria-hidden="true" />
          </InputGroupButton>
        )}
      </InputGroupAddon>
    </InputGroup>
  )
}
