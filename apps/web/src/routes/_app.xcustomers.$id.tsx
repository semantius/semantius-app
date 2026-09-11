import { createFileRoute } from '@tanstack/react-router'
import { translate } from '@/i18n'
import { pageTitle } from '@/lib/pageTitle'

export const Route = createFileRoute('/_app/xcustomers/$id')({
  head: ({ params }) => ({ meta: [{ title: pageTitle(translate('Customer {id}', { id: params.id })) }] }),
  component: () => null, // Content handled by parent route
})
