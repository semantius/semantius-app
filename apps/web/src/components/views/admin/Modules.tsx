import { type EntityViewProps } from '@/types/metadata'
import { EntityView } from '../EntityView'
import { ConfirmDeleteModuleDialog } from './ConfirmDeleteModuleDialog'

/**
 * Specific override for the /admin/modules grid. Identical to the generic
 * EntityView, except that deleting a module — which cascades to every entity in
 * it, their tables and their permissions — asks for the module's slug to be
 * typed before the delete runs (`ConfirmDeleteModuleDialog`).
 */
export function Modules(props: EntityViewProps) {
  return (
    <EntityView
      {...props}
      renderDeleteConfirmation={(p) => <ConfirmDeleteModuleDialog {...p} />}
    />
  )
}
