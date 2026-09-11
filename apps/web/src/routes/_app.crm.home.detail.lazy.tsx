import { createLazyFileRoute } from '@tanstack/react-router'
import { useT } from '@/i18n'

export const Route = createLazyFileRoute('/_app/crm/home/detail')({
  component: RouteComponent,
})

function RouteComponent() {
  const t = useT()

  return (
    <div>
      <p className="text-muted-foreground">
        {t('This is the sidebar content from the detail subroute.')}
      </p>
      <p className="mt-4">
        {t('You can add any content here - forms, data displays, or other components.')}
      </p>
    </div>
  )
}
