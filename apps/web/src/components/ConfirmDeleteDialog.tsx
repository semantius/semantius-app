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
import { Loader2 } from 'lucide-react'
import { Trans } from '@lingui/react'
import { formatDeleteError } from '@/lib/apiErrors'
import { useT } from '@/i18n'

interface ConfirmDeleteDialogProps {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  /**
   * The record's own name, or `''` when it has none. Empty is a real state, not
   * a missing value: the caller must NOT substitute a stand-in phrase, because
   * "this record" slotted into a sentence around it reads as nonsense in an
   * inflecting language ("Kunde diesen Datensatz gelöscht"). The no-name case
   * gets its own sentence here and in useConfirmDelete's toast.
   */
  displayName: string
  isPending: boolean
  error?: Error | null
  handleConfirm: () => void
  handleCancel: () => void
  /** The model's own singular label for what is being deleted ("Customer"). */
  entityType?: string
}

/**
 * Reusable delete confirmation dialog component
 *
 * Use with the useConfirmDelete hook for consistent delete UX
 *
 * @example
 * const deleteConfirm = useConfirmDelete('customers', refetch)
 * return <ConfirmDeleteDialog {...deleteConfirm} entityType="Customer" />
 */
export function ConfirmDeleteDialog({
  isOpen,
  setIsOpen,
  displayName,
  isPending,
  error,
  handleConfirm,
  handleCancel,
  entityType,
}: ConfirmDeleteDialogProps) {
  const t = useT()
  const type = entityType || t('item')

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('Delete {type}', { type })}</AlertDialogTitle>
          <AlertDialogDescription>
            {/*
              One message, markup and all. The record's name is bold INSIDE the
              sentence, and where that emphasis falls is a property of the
              sentence — a translator moves `<bold>` with the words rather than
              being handed three fragments to reassemble. The tag name is ours;
              what it renders is decided here, so a translation can never inject
              markup.
            */}
            {displayName ? (
              <Trans
                id="Are you sure you want to delete <bold>{name}</bold>? This action cannot be undone."
                values={{ name: displayName }}
                components={{ bold: <strong /> }}
              />
            ) : (
              t('Are you sure you want to delete this {type}? This action cannot be undone.', { type })
            )}
          </AlertDialogDescription>
          {error && (
            <p role="alert" className="text-sm font-medium text-destructive pt-1">
              {formatDeleteError(error, t, type)}
            </p>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending} onClick={handleCancel}>
            {t('Cancel')}
          </AlertDialogCancel>
          <Button
            onClick={handleConfirm}
            disabled={isPending}
            variant="destructive"
            type="button"
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('Deleting...')}
              </>
            ) : (
              t('Delete')
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
