import { createFileRoute } from '@tanstack/react-router'
import { pageTitle } from '@/lib/pageTitle'

// Non-lazy half — see _app.$moduleId.$table_name.$key.tsx.
export const Route = createFileRoute('/_app/crm/home/detail')({
  head: () => ({ meta: [{ title: pageTitle('CRM home · Detail') }] }),
})
