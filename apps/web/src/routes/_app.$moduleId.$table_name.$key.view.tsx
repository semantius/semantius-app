import { createFileRoute } from '@tanstack/react-router'
import { pageTitle } from '@/lib/pageTitle'

export const Route = createFileRoute('/_app/$moduleId/$table_name/$key/view')({
  head: ({ params }) => ({
    meta: [{ title: pageTitle(`${params.table_name} ${params.key} · View`) }],
  }),
  component: () => null, // Content handled by parent route (View.tsx)
})
