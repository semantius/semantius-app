import { createFileRoute } from '@tanstack/react-router'
import { translate } from '@/i18n'
import { pageTitle } from '@/lib/pageTitle'

export const Route = createFileRoute('/_app/xcustomers/new')({
  head: () => ({ meta: [{ title: pageTitle(translate('New customer')) }] }),
  component: () => null, // Content handled by parent route
})
