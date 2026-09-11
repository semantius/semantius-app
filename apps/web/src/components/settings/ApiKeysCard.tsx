import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Key, Plus, Trash2, Copy, Check, Loader2 } from 'lucide-react'
import { useRpc, useRpcMutation } from '@/hooks/useRpc'
import { getConfig } from '@/lib/config'
import { Trans } from '@lingui/react'
import { useFormattingLocale, useT } from '@/i18n'
import { formatDateForDisplay, type DateFormat } from '@/lib/date-format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { renderError } from '@/lib/apiErrors'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface ApiKey {
  key_id: string
  description: string
  created_at: string
  last_used_at: string | null
}

interface CreateApiKeyResult {
  key_id: number
  api_key: string
}

/**
 * Both timestamp columns render as a plain calendar date. Named once rather than
 * repeated at the two call sites: a bare 'date' is a discriminator, not text,
 * and one occurrence of it is one thing for a reader to recognize.
 */
const KEY_DATE: DateFormat = 'date'

export function ApiKeysCard() {
  const queryClient = useQueryClient()
  const t = useT()
  const formattingLocale = useFormattingLocale()

  // Fetch existing API keys
  const { data: apiKeys, isLoading } = useRpc<ApiKey[]>('list_api_keys', {
    params: { p_user_id: 0 },
  })

  // Create API key mutation
  const createMutation = useRpcMutation<CreateApiKeyResult, { p_user_id: number; p_description: string }>('generate_api_key', {
    onSuccess: (data) => {
      setNewApiKey(data.api_key)
      setShowNewKeyDialog(true)
      setShowNameDialog(false)
      setKeyName('')
      queryClient.invalidateQueries({ queryKey: ['rpc', 'list_api_keys'] })
    },
  })

  // Revoke API key mutation
  const revokeMutation = useRpcMutation<unknown, { p_key_id: string }>('delete_api_key', {
    onSuccess: () => {
      setDeleteTarget(null)
      queryClient.invalidateQueries({ queryKey: ['rpc', 'list_api_keys'] })
    },
  })

  // State
  const [showNameDialog, setShowNameDialog] = useState(false)
  const [keyName, setKeyName] = useState('')
  const [showNewKeyDialog, setShowNewKeyDialog] = useState(false)
  const [newApiKey, setNewApiKey] = useState('')
  const [copied, setCopied] = useState(false)
  const [copiedEnv, setCopiedEnv] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ApiKey | null>(null)

  const orgName = getConfig().tenantName ?? ''

  const handleCreate = () => {
    if (!keyName.trim()) return
    createMutation.mutate({ p_user_id: 0, p_description: keyName.trim() })
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(newApiKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDelete = () => {
    if (!deleteTarget) return
    revokeMutation.mutate({ p_key_id: deleteTarget.key_id })
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              <CardTitle>{t('API Keys')}</CardTitle>
            </div>
            <Button
              size="sm"
              onClick={() => {
                setKeyName('')
                createMutation.reset()
                setShowNameDialog(true)
              }}
            >
              <Plus className="h-4 w-4" />
              {t('Add new API key')}
            </Button>
          </div>
          <CardDescription>{t('Manage API keys for programmatic access')}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : apiKeys && apiKeys.length > 0 ? (
            // overflow-x-auto: five columns do not fit a 320px card, and without
            // a scroll container the table is simply clipped at the card edge
            // with no way to reach the rest of it (1.4.10).
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-125 text-sm">
                <caption className="sr-only">{t('API keys')}</caption>
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th scope="col" className="px-4 py-2 text-left font-medium">{t('Name')}</th>
                    <th scope="col" className="px-4 py-2 text-left font-medium">{t('Key')}</th>
                    <th scope="col" className="px-4 py-2 text-left font-medium">{t('Created')}</th>
                    <th scope="col" className="px-4 py-2 text-left font-medium">{t('Last Used')}</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">{t('Actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {apiKeys.map((key) => (
                    <tr key={key.key_id} className="border-b last:border-0">
                      <td className="px-4 py-2">{key.description}</td>
                      <td className="px-4 py-2 font-mono text-sm text-muted-foreground">{key.key_id}-...</td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {/* Through the shared helper with the FORMATTING locale,
                            not a bare toLocaleDateString(): the helper is the
                            single source of truth for date display, and the bare
                            call followed the browser rather than the user's
                            chosen format. */}
                        {formatDateForDisplay(key.created_at, KEY_DATE, { locale: formattingLocale })}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {key.last_used_at
                          ? formatDateForDisplay(key.last_used_at, KEY_DATE, { locale: formattingLocale })
                          : t('Never')}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={t('Revoke API key {name}', { name: key.description })}
                          onClick={() => setDeleteTarget(key)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {t('No API keys yet. Create one to get started.')}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Name prompt dialog */}
      <Dialog open={showNameDialog} onOpenChange={setShowNameDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Create API Key')}</DialogTitle>
            <DialogDescription>
              {t('Enter a name to identify this API key.')}
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder={t('e.g. Production, CI/CD, Development')}
            value={keyName}
            onChange={(e) => setKeyName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate()
            }}
            // The dialog mounts only when it opens, so this is the modal's
            // initial focus target — the behavior a dialog is supposed to have —
            // not an autofocus that hijacks a page load, which is what the rule
            // guards against.
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
          {createMutation.error && (
            <p className="text-sm text-destructive">
              {renderError(createMutation.error, t).message}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNameDialog(false)}>
              {t('Cancel')}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!keyName.trim() || createMutation.isPending}
            >
              {createMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              {t('Create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Show new key dialog */}
      <Dialog
        open={showNewKeyDialog}
        onOpenChange={(open) => {
          if (!open) {
            setNewApiKey('')
          }
          setShowNewKeyDialog(open)
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('API Key Created')}</DialogTitle>
            <DialogDescription>
              {t("Copy your API key now. You won't be able to see it again.")}
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <code className="block w-full rounded-md bg-muted p-3 pr-12 font-mono text-sm break-all">
              {newApiKey}
            </code>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1"
              aria-label={copied ? t('API key copied') : t('Copy API key')}
              onClick={handleCopy}
            >
              {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t('Semantius CLI configuration')}</p>
          <div className="relative">
            <code className="block w-full rounded-md bg-muted p-3 pr-12 font-mono text-sm whitespace-pre">
              {`SEMANTIUS_API_KEY=${newApiKey}\nSEMANTIUS_ORG=${orgName}`}
            </code>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1"
              aria-label={copiedEnv ? t('CLI configuration copied') : t('Copy CLI configuration')}
              onClick={async () => {
                await navigator.clipboard.writeText(`SEMANTIUS_API_KEY=${newApiKey}\nSEMANTIUS_ORG=${orgName}`)
                setCopiedEnv(true)
                setTimeout(() => setCopiedEnv(false), 2000)
              }}
            >
              {copiedEnv ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowNewKeyDialog(false)}>{t('Done')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null)
            revokeMutation.reset()
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Revoke API Key')}</AlertDialogTitle>
            <AlertDialogDescription>
              {/* One sentence, markup included: which words the name sits
                  between is a property of the sentence, not something to
                  reassemble from three fragments per language. */}
              <Trans
                id="Are you sure you want to revoke <bold>{name}</bold>? This action cannot be undone and any integrations using this key will stop working."
                values={{ name: deleteTarget?.description ?? '' }}
                components={{ bold: <strong /> }}
              />
            </AlertDialogDescription>
            {revokeMutation.error && (
              <p className="text-sm text-destructive pt-1">
                {renderError(revokeMutation.error, t).message}
              </p>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={revokeMutation.isPending}
              onClick={() => setDeleteTarget(null)}
            >
              {t('Cancel')}
            </AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={revokeMutation.isPending}
            >
              {revokeMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('Revoking...')}
                </>
              ) : (
                t('Revoke')
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
