import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { useT } from '@/i18n'
import { useDeleteRecord } from './useTableMutations'

export interface DeleteConfirmation {
  id: string | number
  displayName: string
  /** The row being deleted, as the grid holds it. */
  record: Record<string, unknown>
}

/**
 * Hook for handling delete confirmations with mutation
 * 
 * @param tableName - Name of the PostgREST table
 * @param onSuccess - Optional callback after successful delete
 * @param idField - Name of the primary key field (default: 'id')
 * @returns Object with state and handlers for delete confirmation dialog
 * 
 * @example
 * const deleteConfirm = useConfirmDelete('customers', refetch)
 * 
 * // For tables with non-standard primary key:
 * const deleteConfirm = useConfirmDelete('customers', refetch, 'email')
 * 
 * // In your delete button:
 * onClick={() => deleteConfirm.showConfirmation(customer.id, customer.email, customer)}
 * 
 * // In your JSX:
 * <ConfirmDeleteDialog {...deleteConfirm} entityType="Customer" />
 */
export function useConfirmDelete(tableName: string, onSuccess?: () => void, idField?: string, singularLabel?: string) {
  const t = useT()
  const [isOpen, setIsOpen] = useState(false)
  // Closing does NOT clear the item: a dialog still fading out must keep its
  // record and name. Clearing them flipped the generic dialog's sentence to its
  // no-name variant mid-transition, and would force a custom dialog (the grid's
  // `renderDeleteConfirmation`) to unmount before Base UI's closing transition,
  // which is what returns focus to the opener. The next showConfirmation
  // overwrites it; `openCount` tells the grid a new confirmation began.
  const [itemToDelete, setItemToDelete] = useState<DeleteConfirmation | null>(null)
  const [openCount, setOpenCount] = useState(0)
  const deleteMutation = useDeleteRecord(tableName, idField)

  // STABLE across renders, and it has to be: the grid builds its columns in a
  // memo that depends on this function, and every cell is rendered from a column
  // function — a new function per render remounted every cell, the row's "..."
  // button included, so keyboard focus on it was lost whenever the grid
  // re-rendered and the delete dialog had nothing to return focus to.
  // `reset` is stable for the life of the mutation observer.
  const { reset: resetMutation } = deleteMutation
  const showConfirmation = useCallback(
    (id: string | number, displayName: string, record: Record<string, unknown>) => {
      resetMutation()
      setItemToDelete({ id, displayName, record })
      setOpenCount((n) => n + 1)
      setIsOpen(true)
    },
    [resetMutation],
  )

  const handleConfirm = async () => {
    if (!itemToDelete) return
    
    try {
      await deleteMutation.mutateAsync(itemToDelete.id)
      setIsOpen(false)
      const deletedName = itemToDelete.displayName
      onSuccess?.()
      // Four whole sentences rather than a label glued on with a space: German
      // puts the verb last, so "Kunde Acme gelöscht" and "Acme gelöscht" are not
      // the same sentence with a prefix — and a record with no name of its own
      // needs a sentence that does not have a hole where the name would go,
      // rather than a stand-in phrase pushed through the same one.
      toast.success(
        deletedName
          ? singularLabel
            ? t('{label} {name} deleted', { label: singularLabel, name: deletedName })
            : t('{name} deleted', { name: deletedName })
          : singularLabel
            ? t('{label} deleted', { label: singularLabel })
            : t('Record deleted'),
      )
    } catch (error) {
      console.error('Delete failed:', error)
      // Keep dialog open on error so user can retry
    }
  }

  const handleCancel = () => {
    if (!deleteMutation.isPending) {
      setIsOpen(false)
    }
  }

  return {
    isOpen,
    displayName: itemToDelete?.displayName || '',
    record: itemToDelete?.record ?? null,
    openCount,
    isPending: deleteMutation.isPending,
    error: deleteMutation.error,
    showConfirmation,
    handleConfirm,
    handleCancel,
    setIsOpen: (open: boolean) => {
      if (!deleteMutation.isPending) {
        setIsOpen(open)
      }
    },
  }
}
