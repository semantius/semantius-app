import { createFileRoute } from '@tanstack/react-router'
import { translate } from '@/i18n'
import { pageTitle } from '@/lib/pageTitle'

// Non-lazy half — see _app.$moduleId.$table_name.$key.tsx for why `head` cannot
// live in the `.lazy` file.
export const Route = createFileRoute('/_app/crm/home')({
  head: () => ({ meta: [{ title: pageTitle(translate('CRM home')) }] }),
})
