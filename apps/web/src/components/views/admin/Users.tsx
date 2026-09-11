import { KeyRound } from 'lucide-react'
import { type ViewProps } from '@/types/metadata'
import { type RowMenuItem } from '@/components/data-table-view/DataTableView'
import { useT } from '@/i18n'
import { View } from '../View'

/**
 * Specific override for the /admin/users grid. Identical to the generic View,
 * except each row's "..." menu gains a "Manage API keys" entry when the row is an
 * agent (`is_agent`). The handler is a placeholder until the API-key infra lands.
 */
export function Users(props: ViewProps) {
  const t = useT()
  const getRowMenuItems = (record: Record<string, unknown>): RowMenuItem[] =>
    record.is_agent
      ? [
          {
            key: 'manage-api-keys',
            label: t('Manage API keys'),
            icon: KeyRound,
            // Placeholder — real handler added once API-key infra exists.
            onClick: () => {},
          },
        ]
      : []

  return <View {...props} getRowMenuItems={getRowMenuItems} />
}
