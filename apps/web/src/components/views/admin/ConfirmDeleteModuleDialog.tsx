import { useId, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Trans } from '@lingui/react'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { DeleteConfirmationProps } from '@/components/data-table-view/DataTableView'
import { renderError } from '@/lib/apiErrors'
import { useT } from '@/i18n'

/**
 * The delete confirmation for a row of `modules`, in two steps.
 *
 * Deleting a module cascades to every entity in it, their database tables and
 * their permissions, so the standard warning is followed by a second step in
 * which the module's slug has to be typed before Delete is enabled.
 *
 * Mounted by the grid through `renderDeleteConfirmation`, which remounts it for
 * every Delete — so it always opens at step 1 with an empty field, and nothing
 * here resets state. The grid keeps the mutation: `handleConfirm` deletes,
 * refetches and toasts, closes on success and leaves the dialog open on error.
 */
export function ConfirmDeleteModuleDialog({
  record,
  displayName,
  entityType,
  isOpen,
  setIsOpen,
  isPending,
  error,
  handleConfirm,
  handleCancel,
}: DeleteConfirmationProps) {
  const t = useT()
  const inputId = useId()
  const [step, setStep] = useState<1 | 2>(1)
  const [typed, setTyped] = useState('')

  // The model requires no field of `modules`, so the slug can be empty. An empty
  // slug must not turn the check into "type nothing": it fails closed, and such
  // a module (unroutable anyway) is deleted through the API instead.
  const slug = String(record.module_slug ?? '')
  const matches = slug !== '' && typed.trim() === slug

  const confirm = () => {
    if (matches && !isPending) handleConfirm()
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('Delete {type}', { type: entityType })}</AlertDialogTitle>
          <AlertDialogDescription>
            {step === 2 ? (
              <Trans id="Type <bold>{slug}</bold> to confirm." values={{ slug }} components={{ bold: <strong /> }} />
            ) : displayName ? (
              <Trans
                id="Deleting <bold>{name}</bold> removes the module, every entity in it, their database tables and their permissions. This action cannot be undone."
                values={{ name: displayName }}
                components={{ bold: <strong /> }}
              />
            ) : (
              // A sentence of its own rather than a stand-in name: see
              // ConfirmDeleteDialog for why a placeholder phrase inside the
              // sentence reads as nonsense once the language inflects.
              t('Deleting this module removes it, every entity in it, their database tables and their permissions. This action cannot be undone.')
            )}
          </AlertDialogDescription>
          {error && (
            <p role="alert" className="text-sm font-medium text-destructive pt-1">
              {renderError(error, t, { label: entityType }).message}
            </p>
          )}
        </AlertDialogHeader>
        {step === 2 && (
          <div className="grid gap-2">
            <Label htmlFor={inputId}>{t('Module slug')}</Label>
            <Input
              id={inputId}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirm()
              }}
              autoComplete="off"
              spellCheck={false}
              disabled={isPending}
              // Step 2 replaces step 1 inside a dialog that is already open, and
              // the button that had focus is gone: this is where focus belongs
              // next, not an autofocus that hijacks a page load, which is what
              // the rule guards against.
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
            />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending} onClick={handleCancel}>
            {t('Cancel')}
          </AlertDialogCancel>
          {step === 1 ? (
            <Button key="next" type="button" variant="destructive" onClick={() => setStep(2)}>
              {t('Delete')}
            </Button>
          ) : (
            // A plain Button, not AlertDialogAction, so it does not close the
            // dialog by itself: the hook closes it on success and keeps it open
            // to show the error otherwise, as in the generic dialog.
            <Button key="confirm" type="button" variant="destructive" disabled={!matches || isPending} onClick={confirm}>
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('Deleting...')}
                </>
              ) : (
                t('Delete')
              )}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
