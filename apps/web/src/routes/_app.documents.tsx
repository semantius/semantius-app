import { createFileRoute } from '@tanstack/react-router'
import { translate } from '@/i18n'
import { pageTitle } from '@/lib/pageTitle'
import { FileText, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export const Route = createFileRoute('/_app/documents')({
  head: () => ({ meta: [{ title: pageTitle(translate('Documents')) }] }),
  component: DocumentsComponent,
})

function DocumentsComponent() {
  return (
    <div className="space-y-6">
      {/* flex-wrap: see the same row in views/View.tsx (1.4.10 at 320px). */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight">Documents</h1>
          <p className="text-muted-foreground">
            Manage your documents here
          </p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          New Document
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            <CardTitle>Sample Documents Route</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <CardDescription>
            This is a sample protected route. Replace this content with your business logic.
          </CardDescription>
        </CardContent>
      </Card>
    </div>
  )
}
