import { useForm } from '@tanstack/react-form'
import { useCreateRecord, useUpdateRecord } from '@/hooks/useTableMutations'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Loader2 } from 'lucide-react'
import { useT } from '@/i18n'
import { useState } from 'react'

type Customer = Record<string, unknown>

interface CustomerFormProps {
  customer?: Customer
  mode: 'view' | 'edit' | 'create'
  onClose: () => void
  displayMode?: 'sidebar' | 'modal'
}

export function CustomerForm({ customer, mode, onClose, displayMode = 'sidebar' }: CustomerFormProps) {
  const t = useT()
  const createCustomer = useCreateRecord('customers')
  const updateCustomer = useUpdateRecord('customers')
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false)

  const form = useForm({
    defaultValues: {
      email: String(customer?.email || ''),
      phone: String(customer?.phone || ''),
      company: String(customer?.company || ''),
      status: String(customer?.status || 'active'),
      total_orders: Number(customer?.total_orders || 0),
    },
    onSubmit: async ({ value }) => {
      try {
        if (mode === 'create') {
          await createCustomer.mutateAsync(value)
        } else if (mode === 'edit') {
          // Ensure we pass the ID for updates
          if (!customer?.id) {
            throw new Error('Customer ID is required for updates')
          }
          await updateCustomer.mutateAsync({
            ...value,
            id: customer.id,
          })
        }
        onClose()
      } catch (error) {
        console.error('Failed to save customer:', error)
      }
    },
  })

  const isReadOnly = mode === 'view'
  const isFormDirty = form.state.isDirty

  const handleClose = () => {
    if (isFormDirty && mode !== 'view') {
      setShowUnsavedDialog(true)
    } else {
      onClose()
    }
  }

  const confirmClose = () => {
    setShowUnsavedDialog(false)
    onClose()
  }

  const cancelClose = () => {
    setShowUnsavedDialog(false)
  }

  // Render header based on display mode
  const HeaderComponent = displayMode === 'modal' ? (
    <DialogHeader>
      <DialogTitle>
        {mode === 'create'
          ? t('Create New Customer')
          : mode === 'edit'
            ? t('Edit Customer')
            : t('Customer Details')}
      </DialogTitle>
      <DialogDescription>
        {mode === 'create'
          ? t('Add a new customer to the system.')
          : mode === 'edit'
            ? t('Make changes to the customer information.')
            : t('View customer information.')}
      </DialogDescription>
    </DialogHeader>
  ) : (
    <SheetHeader>
      <SheetTitle>
        {mode === 'create'
          ? t('Create New Customer')
          : mode === 'edit'
            ? t('Edit Customer')
            : t('Customer Details')}
      </SheetTitle>
      <SheetDescription>
        {mode === 'create'
          ? t('Add a new customer to the system.')
          : mode === 'edit'
            ? t('Make changes to the customer information.')
            : t('View customer information.')}
      </SheetDescription>
    </SheetHeader>
  )

  const isLoading = createCustomer.isPending || updateCustomer.isPending

  return (
    <>
      <div className="flex flex-col h-full">
        {HeaderComponent}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          e.stopPropagation()
          form.handleSubmit()
        }}
        className="flex-1 overflow-y-auto space-y-4"
      >
        <form.Field name="email">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor="email">
                {t('Email Address')} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="customer@example.com"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                disabled={isReadOnly || isLoading}
                required
              />
            </div>
          )}
        </form.Field>

        <form.Field name="phone">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor="phone">{t('Phone Number')}</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="+1 (555) 000-0000"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                disabled={isReadOnly || isLoading}
              />
            </div>
          )}
        </form.Field>

        <form.Field name="company">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor="company">{t('Company Name')}</Label>
              <Input
                id="company"
                type="text"
                placeholder="Acme Inc."
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                disabled={isReadOnly || isLoading}
              />
            </div>
          )}
        </form.Field>

        <form.Field name="status">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor="status">
                {t('Status')} <span className="text-destructive">*</span>
              </Label>
              <select
                id="status"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                disabled={isReadOnly || isLoading}
                required
                className="flex h-10 w-full rounded-md border border-input-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="active">{t('Active')}</option>
                <option value="inactive">{t('Inactive')}</option>
                <option value="pending">{t('Pending')}</option>
                <option value="suspended">{t('Suspended')}</option>
              </select>
            </div>
          )}
        </form.Field>

        <form.Field name="total_orders">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor="total_orders">
                {t('Total Orders')} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="total_orders"
                type="number"
                min="0"
                placeholder="0"
                value={field.state.value}
                onChange={(e) => field.handleChange(Number(e.target.value))}
                onBlur={field.handleBlur}
                disabled={isReadOnly || isLoading}
                required
              />
            </div>
          )}
        </form.Field>

        {mode !== 'view' && (
          <div className="flex gap-2 pt-4">
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === 'create' ? t('Create Customer') : t('Save Changes')}
            </Button>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading}>
              {t('Cancel')}
            </Button>
          </div>
        )}

        {mode === 'view' && (
          <div className="flex gap-2 pt-4">
            <Button type="button" onClick={onClose}>
              {t('Close')}
            </Button>
          </div>
        )}
      </form>

        {(createCustomer.error || updateCustomer.error) && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {createCustomer.error?.message || updateCustomer.error?.message}
          </div>
        )}
      </div>

      {/* Unsaved changes confirmation dialog */}
      <AlertDialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Unsaved Changes')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('You have unsaved changes. Are you sure you want to close without saving?')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelClose}>{t('Continue Editing')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmClose}>{t('Discard Changes')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
