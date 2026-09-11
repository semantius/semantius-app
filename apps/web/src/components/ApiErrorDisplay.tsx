import { AlertCircle } from 'lucide-react'
import { useT } from '@/i18n'
import { renderError } from '@/lib/apiErrors'
import { ErrorDetails } from '@/components/ErrorDetails'

interface ApiErrorDisplayProps {
  error: Error | { message: string; [key: string]: unknown }
  title?: string
}

export function ApiErrorDisplay({ error, title }: ApiErrorDisplayProps) {
  const t = useT()
  // Defaulted in the body, not in the parameter list: a default parameter is
  // evaluated before the body runs, so it cannot call a hook.
  const heading = title ?? t('Error loading data')

  // One renderer for every origin — an app template, a platform error with
  // its envelope, a plain server sentence — through this component's own `t`,
  // so the sentence follows a language switch (see lib/apiErrors.ts).
  const rendered =
    typeof error === 'object' && 'message' in error
      ? renderError(error instanceof Error ? error : new Error(String(error.message), { cause: error }), t)
      : { message: t('An unknown error occurred') }

  return (
    <div className="rounded-md border border-destructive/50 bg-destructive/10">
      <div className="flex items-start gap-3 p-4">
        <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-destructive">{heading}</p>
          {/* text-foreground, not text-muted-foreground: muted on the card's
              bg-destructive/10 tint is below 4.5:1 (1.4.3), caught by a route
              audit on a view that happened to render this card. The same goes
              for the Details button. tokenContrast.test.ts pins the pair. */}
          <p className="text-sm text-foreground mt-1 break-words">{rendered.message}</p>
          {rendered.hint && <p className="text-sm text-foreground mt-1 break-words">{rendered.hint}</p>}
          {/* The stack, the server's `details` text and the rest of the body,
              behind one toggle — every caught error has it. */}
          <ErrorDetails error={error} text={rendered.details} className="mt-3" />
        </div>
      </div>
    </div>
  )
}
