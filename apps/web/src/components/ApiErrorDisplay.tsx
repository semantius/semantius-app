import { useState } from 'react'
import { AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n'

interface ApiErrorDisplayProps {
  error: Error | { message: string; [key: string]: unknown }
  title?: string
}

export function ApiErrorDisplay({ error, title }: ApiErrorDisplayProps) {
  const t = useT()
  const [isExpanded, setIsExpanded] = useState(false)
  // Defaulted in the body, not in the parameter list: a default parameter is
  // evaluated before the body runs, so it cannot call a hook.
  const heading = title ?? t('Error loading data')

  // Extract error details
  const errorMessage = typeof error === 'object' && 'message' in error 
    ? String(error.message) 
    : t('An unknown error occurred')

  // Try to parse additional details from error
  let errorDetails: Record<string, unknown> = {}
  
  if (error instanceof Error && error.cause) {
    // Validate that cause is an object before using it
    if (typeof error.cause === 'object' && error.cause !== null && !Array.isArray(error.cause)) {
      const causeObj = error.cause as Record<string, unknown>
      // Extract all properties except message (since it's already shown above)
      errorDetails = Object.entries(causeObj).reduce((acc, [key, value]) => {
        if (key !== 'message' && value !== undefined) {
          acc[key] = value
        }
        return acc
      }, {} as Record<string, unknown>)
    }
  } else if (typeof error === 'object' && error !== null) {
    // Extract all properties except message
    errorDetails = Object.entries(error).reduce((acc, [key, value]) => {
      if (key !== 'message' && value !== undefined) {
        acc[key] = value
      }
      return acc
    }, {} as Record<string, unknown>)
  }

  const hasDetails = Object.keys(errorDetails).length > 0

  return (
    <div className="rounded-md border border-destructive/50 bg-destructive/10">
      <div className="flex items-start gap-3 p-4">
        <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-destructive">{heading}</p>
          {/* text-foreground, not text-muted-foreground: muted on the card's
              bg-destructive/10 tint is below 4.5:1 (1.4.3), caught by a route
              audit on a view that happened to render this card. The same goes
              for the Details button below. tokenContrast.test.ts pins the pair. */}
          <p className="text-sm text-foreground mt-1 break-words">{errorMessage}</p>
          
          {hasDetails && (
            <div className="mt-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExpanded(!isExpanded)}
                className="h-auto py-1 px-2 -ml-2 text-xs text-foreground hover:underline"
              >
                {isExpanded ? (
                  <>
                    <ChevronUp className="h-3 w-3 mr-1" />
                    {t('Details')}
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3 w-3 mr-1" />
                    {t('Details')}
                  </>
                )}
              </Button>

              {isExpanded && (
                <div className="mt-2 rounded-md bg-muted/50 p-3 border border-border">
                  <pre className="text-xs overflow-x-auto whitespace-pre-wrap break-words">
                    {JSON.stringify(errorDetails, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
