import { useCallback } from 'react'
import { KeyRound } from 'lucide-react'
import { type EntityViewProps } from '@/types/metadata'
import { type RowMenuItem } from '@/components/data-table-view/DataTableView'
import { useT } from '@/i18n'
import { EntityView } from '../EntityView'

/**
 * Specific override for the /admin/users grid. Identical to the generic EntityView,
 * except each row's "..." menu gains a "Manage API keys" entry when the row is an
 * agent (`is_agent`). The handler is a placeholder until the API-key infra lands.
 */
export function Users(props: EntityViewProps) {
  const t = useT()
  // Memoized: the grid rebuilds its columns — remounting every cell — whenever
  // this function's identity changes (see views/README.md).
  const getRowMenuItems = useCallback(
    (record: Record<string, unknown>): RowMenuItem[] =>
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
        : [],
    [t],
  )

  return <EntityView {...props} getRowMenuItems={getRowMenuItems} />
}
