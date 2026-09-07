import { createFileRoute } from '@tanstack/react-router'
import { translate } from '@/i18n'
import { pageTitle } from '@/lib/pageTitle'
import { hideAppLoader } from '@/lib/appLoader'
import { useState, useEffect } from 'react'
import { FormPlayground } from '../components/form/Playground'

interface FormPlaygroundSearch {
  schema?: string
}

export const Route = createFileRoute('/form-playground')({
  head: () => ({ meta: [{ title: pageTitle(translate('Form playground')) }] }),
  validateSearch: (search: Record<string, unknown>): FormPlaygroundSearch => {
    return {
      schema: search.schema as string | undefined,
    }
  },
  component: FormPlaygroundWrapper,
})

function FormPlaygroundWrapper() {
  const { schema: schemaUrl } = Route.useSearch()
  const [initialSchema, setInitialSchema] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(false)

  // A standalone page outside the _app layout: nothing downstream will take the
  // index.html boot overlay down, so this route must (see the hang invariant in
  // CONTEXT-MEMORY.md). Both of its renders — the "Loading schema..." notice and
  // the playground itself — are visible content, so it comes down on mount.
  // Without this the playground sat behind the spinner on every visit, and the
  // overlay swallowed every click on it.
  useEffect(() => {
    hideAppLoader()
  }, [])

  useEffect(() => {
    if (!schemaUrl) {
      setInitialSchema(undefined)
      return
    }

    setLoading(true)

    fetch(schemaUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to fetch schema: ${response.statusText}`)
        }
        return response.json()
      })
      .then((data) => {
        setInitialSchema(JSON.stringify(data, null, 2))
        setLoading(false)
      })
      .catch((err) => {
        console.error('Error loading schema:', err)
        setLoading(false)
      })
  }, [schemaUrl])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-base text-muted-foreground">
        Loading schema...
      </div>
    )
  }

  return <FormPlayground initialSchema={initialSchema} />
}
