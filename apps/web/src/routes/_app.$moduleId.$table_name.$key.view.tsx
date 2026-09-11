import { createFileRoute } from '@tanstack/react-router'
import { translate } from '@/i18n'
import { pageTitle } from '@/lib/pageTitle'

export const Route = createFileRoute('/_app/$moduleId/$table_name/$key/view')({
  head: ({ params }) => ({
    meta: [{ title: pageTitle(translate('{table} {key} · View', { table: params.table_name, key: params.key })) }],
  }),
  component: () => null, // Content handled by parent route (View.tsx)
})
