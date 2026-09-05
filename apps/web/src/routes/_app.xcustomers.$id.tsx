import { createFileRoute } from '@tanstack/react-router'
import { pageTitle } from '@/lib/pageTitle'

export const Route = createFileRoute('/_app/xcustomers/$id')({
  head: ({ params }) => ({ meta: [{ title: pageTitle(`Customer ${params.id}`) }] }),
  component: () => null, // Content handled by parent route
})
