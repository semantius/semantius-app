import { createFileRoute } from '@tanstack/react-router'
import { pageTitle } from '@/lib/pageTitle'

export const Route = createFileRoute('/_app/xcustomers/$id/edit')({
  head: ({ params }) => ({ meta: [{ title: pageTitle(`Edit customer ${params.id}`) }] }),
  component: () => null, // Content handled by parent route
})
