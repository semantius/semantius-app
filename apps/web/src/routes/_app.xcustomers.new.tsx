import { createFileRoute } from '@tanstack/react-router'
import { pageTitle } from '@/lib/pageTitle'

export const Route = createFileRoute('/_app/xcustomers/new')({
  head: () => ({ meta: [{ title: pageTitle('New customer') }] }),
  component: () => null, // Content handled by parent route
})
