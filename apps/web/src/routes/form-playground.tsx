import { createFileRoute } from '@tanstack/react-router'
import { pageTitle } from '@/lib/pageTitle'
import { useState, useEffect } from 'react'
import { FormPlayground } from '../components/form/Playground'

interface FormPlaygroundSearch {
  schema?: string
}

export const Route = createFileRoute('/form-playground')({
  head: () => ({ meta: [{ title: pageTitle('Form playground') }] }),
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
