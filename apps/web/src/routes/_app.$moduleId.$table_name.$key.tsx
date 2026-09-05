import { createFileRoute } from '@tanstack/react-router'
import { pageTitle } from '@/lib/pageTitle'

// Non-lazy half of the record route. `createLazyFileRoute` only accepts the
// component options, so any critical route config — `head` among them — has to
// live here; the component stays in `_app.$moduleId.$table_name.$key.lazy.tsx`.
// Without this the record page inherits the list page's <title> and the two are
// indistinguishable in history, in tabs, and to a screen reader after navigation.
export const Route = createFileRoute('/_app/$moduleId/$table_name/$key')({
  head: ({ params }) => ({
    meta: [{ title: pageTitle(`${params.table_name} ${params.key}`) }],
  }),
})
