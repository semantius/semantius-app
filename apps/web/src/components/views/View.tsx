import { useNavigate, useRouter, useRouterState, useSearch, Link } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { type ViewProps, type ChildRelation } from "@/types/metadata"
import { useTable } from '@/hooks/useTable'
import { useRpc } from '@/hooks/useRpc'
import { useUserHasPermission } from '@/hooks/useUserPermissions'
import { DataTableView, type RowMenuItem } from '@/components/data-table-view/DataTableView'
import { EntityBreadcrumb } from '@/components/EntityBreadcrumb'
import { BookmarkIcon } from '@/components/ui-ext/bookmark-icon'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Plus, Users } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { DataFormPage } from '@/components/data-table-view/DataFormPage'

type RecordType = Record<string, unknown>

/** Minimal shape of a get_schema response needed for parent breadcrumb */
interface ParentEntitySchema {
  table?: { plural_label?: string; id_column?: string; label_column?: string }
}

/**
 * Build the URL for navigating to a child relation table, pre-filtered to the parent record.
 * Uses manual URL construction (not TanStack Router search params) to avoid JSON-encoding
 * of plain string/numeric values — TanStack Router JSON-encodes strings that are valid JSON
 * (e.g. '1002' → %221002%22). router.history.push with a raw URL bypasses this.
 */
function buildChildNavUrl(moduleId: string, childId: string, recordId: string): string {
  const childTable = childId.split('.')[0]
  return `/${moduleId}/${childTable}?_pf=${encodeURIComponent(childId)}&_pv=${encodeURIComponent(String(recordId))}`
}

/**
 * Standalone view for a single record (/module/entity/id/view) or new record creation (/module/entity/new).
 * Renders breadcrumbs + form without the data table list.
 */
function StandaloneFormView({
  metadata,
  recordId,
  moduleId,
  viewName,
  canEdit,
  parentLabel,
  parentPath,
  parentRecordLabel,
  parentRecordPath,
}: {
  metadata: ViewProps['metadata']
  recordId: string | null
  moduleId: string
  viewName: string
  canEdit: boolean
  parentLabel?: string
  parentPath?: string
  parentRecordLabel?: string
  parentRecordPath?: string
}) {
  const navigate = useNavigate()
  const router = useRouter()
  // Live pathname of the current record page — the canonical URL we bookmark.
  const currentPath = useRouterState({ select: (s) => s.location.pathname })
  const idColumn = metadata.table?.id_column || 'id'
  const labelColumn = metadata.table?.label_column || ''
  const postSaveTargetRef = useRef<string | null>(null)
  const FORM_ID = 'standalone-record-form'

  // Fetch just the label column value for the breadcrumb display name
  const { data: labelData } = useTable(metadata.table?.table_name || '', {
    query: `select=${labelColumn}&${idColumn}=eq.${recordId}`,
    enabled: !!recordId && !!labelColumn,
  })

  const recordLabel = recordId
    ? (labelData?.[0]?.[labelColumn] as string) || String(recordId)
    : undefined

  const singularLabel = metadata.table?.singular_label || 'Record'
  const pageTitle = recordId
    ? recordLabel || singularLabel
    : `New ${singularLabel}`

  const handleBeforeSubmit = (submitter: Element | null) => {
    const childId = submitter instanceof HTMLElement ? submitter.dataset.childId : undefined
    if (childId && recordId) {
      postSaveTargetRef.current = buildChildNavUrl(moduleId, childId, recordId)
    } else {
      postSaveTargetRef.current = null
    }
  }

  const handleSave = () => {
    const target = postSaveTargetRef.current
    postSaveTargetRef.current = null
    if (target) {
      router.history.push(target)
    } else {
      navigate({ to: viewName })
    }
  }

  const children: ChildRelation[] = metadata.children || []

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1">
        <EntityBreadcrumb
          moduleId={moduleId}
          entityLabel={metadata.table?.plural_label || 'Records'}
          entityPath={viewName}
          recordLabel={pageTitle}
          parentLabel={parentLabel}
          parentPath={parentPath}
          parentRecordLabel={parentRecordLabel}
          parentRecordPath={parentRecordPath}
        />
        {recordId && (
          <BookmarkIcon url={currentPath} title={pageTitle} label={pageTitle} />
        )}
      </div>
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">
          {pageTitle}
        </h1>
        {children.length > 0 && (
          <div className="flex gap-2 flex-wrap justify-end">
            {children.map((child) => (
              <Button
                key={child.id}
                type="submit"
                form={FORM_ID}
                data-child-id={child.id}
              >
                {child.plural_label_parent || child.plural_label}...
              </Button>
            ))}
          </div>
        )}
      </div>
      <DataFormPage
        schema={metadata}
        recordId={recordId}
        onClose={handleSave}
        formMode={recordId ? (canEdit ? 'edit' : 'view') : 'create'}
        formId={FORM_ID}
        onBeforeSubmit={handleBeforeSubmit}
      />
    </div>
  )
}

export function View({ moduleId: _moduleId, table_name: _table_name, recordId: _recordId, metadata, getRowMenuItems }: ViewProps & { getRowMenuItems?: (record: Record<string, unknown>) => RowMenuItem[] }) {
  const navigate = useNavigate()
  const router = useRouter()
  const routerState = useRouterState()

  // Extract primary key column name from metadata (source of truth)
  const idColumn = metadata.table?.id_column || 'id'

  // Check if user can edit - call hook unconditionally, then check if permission is required
  const hasEditPermission = useUserHasPermission(
    (metadata.table as { edit_permission?: string | null })?.edit_permission || ''
  )
  const canEdit = (metadata.table as { edit_permission?: string | null })?.edit_permission
    ? hasEditPermission
    : true

  // Parse URL to determine mode
  const pathname = routerState.location.pathname
  // Extract module_name and table_name from pathname (e.g., /crm/customers)
  const pathParts = pathname.split('/').filter(Boolean)
  const module_name = pathParts[0] || ''
  const table_name = pathParts[1] || ''
  const view_name = `/${module_name}/${table_name}`
  const escapedViewName = view_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  const children: ChildRelation[] = metadata.children || []
  // 'auto' always resolves to an overlay sidebar (wide/two-column on large screens with
  // many fields, narrow otherwise — see resolveDisplayMode/useWideSidebar below). Child
  // navigation still works from the sidebar: the child buttons save the record and then
  // navigate to the child table (handleOverlayBeforeSubmit), so no stable page URL is
  // needed. Only an explicit edit_mode of 'page' / 'modal' / 'sidebar' overrides this.
  const effectiveEditMode = metadata.table?.edit_mode || 'auto'

  // Read parent-filter params from URL
  const { _pf, _pv } = useSearch({
    strict: false,
    select: (s: Record<string, unknown>) => ({
      _pf: s._pf as string | undefined,
      _pv: s._pv as string | undefined,
    }),
  })

  // Derive reference table for parent breadcrumb from the _pf field's schema
  const pfColumn = _pf?.includes('.') ? _pf.split('.')[1] : _pf
  const pfFieldSchema = pfColumn
    ? (metadata.properties?.[pfColumn] as Record<string, unknown> | undefined)
    : undefined
  const refTable = pfFieldSchema?.reference_table as string | undefined

  // Fetch parent entity schema to get label_plural for breadcrumb
  const { data: parentEntitySchema } = useRpc<ParentEntitySchema>('get_schema', {
    params: { p_table_name: refTable || '' },
    enabled: !!refTable,
  })
  const parentLabel = parentEntitySchema?.table?.plural_label
  const parentPath = refTable ? `/${module_name}/${refTable}` : undefined

  // Fetch the specific parent record to get its label value (e.g. "sales@test.com" for user 1002)
  const refIdCol = parentEntitySchema?.table?.id_column
  const refLabelCol = parentEntitySchema?.table?.label_column
  const { data: parentRecordData } = useTable(refTable || '', {
    query: refIdCol && _pv ? `select=${refLabelCol}&${refIdCol}=eq.${_pv}` : '',
    enabled: !!refTable && !!refIdCol && !!refLabelCol && !!_pv,
  })
  const parentRecordLabel = refLabelCol
    ? (parentRecordData?.[0]?.[refLabelCol] as string | undefined)
    : undefined
  const parentRecordPath = refTable && _pv ? `/${module_name}/${refTable}/${_pv}/view` : undefined

   
  const navigatePreservingSearch = (opts: Record<string, unknown>) => {
    ;(navigate as any)({ ...opts, search: (prev: Record<string, unknown>) => prev })
  }

  /**
   * Single navigation function for all record interactions.
   * mode 'new'  → create form  (page: /new,       overlay: /create)
   * mode 'open' → view/edit form (page: /$id/view, overlay: /$id)
   */
  const navigateForEditMode = (mode: 'new' | 'open', record?: RecordType) => {
    if (mode === 'new') {
      if (effectiveEditMode === 'page') {
        // Preserve _pf/_pv so the create form can pre-fill parent field
        navigatePreservingSearch({ to: `${view_name}/new` })
      } else {
        navigatePreservingSearch({ to: `${view_name}/create` })
      }
    } else {
      const id = record ? String(record[idColumn]) : undefined
      if (effectiveEditMode === 'page') {
        navigate({ to: `${view_name}/${id}/view` })
      } else {
        navigatePreservingSearch({
          to: `${view_name}/$id`,
          params: { id: id! },
        })
      }
    }
  }

  // Standalone mode detection: /module/entity/id/view or /module/entity/new
  const standaloneViewMatch = pathname.match(new RegExp(`^${escapedViewName}/([^/]+)/view$`))
  const isStandaloneNew = pathname === `${view_name}/new`
  const isStandalone = !!standaloneViewMatch || isStandaloneNew

  // --- Overlay open-state detection (computed before the early return so the
  // width-capture hooks below run unconditionally — see rules-of-hooks note). ---
  const CREATE_SEGMENT = 'create'
  const isCreateMode = pathname === `${view_name}/${CREATE_SEGMENT}`

  const editMatch = pathname.match(new RegExp(`^${escapedViewName}/([^/]+)/edit$`))
  const viewMatchResult = pathname.match(new RegExp(`^${escapedViewName}/([^/]+)$`))
  // Exclude 'create' from being treated as a record ID
  const viewMatch =
    viewMatchResult && !editMatch && viewMatchResult[1] !== CREATE_SEGMENT
      ? viewMatchResult
      : null

  const isEditMode = !!editMatch
  const recordId = editMatch?.[1] || viewMatch?.[1]
  const isOpen = isCreateMode || !!recordId

  const fieldCount = Object.keys(metadata.properties || {}).length

  // All hooks (useNavigate, useRouter, useRouterState, useUserHasPermission, useRef) must be called
  // unconditionally before any early return to satisfy React's rules of hooks.
  const overlayPostSaveTargetRef = useRef<string | null>(null)

  // Capture the viewport width at the moment the overlay opens and freeze it for the
  // lifetime of that open. We adjust state during render when `isOpen` flips (React's
  // recommended derived-state pattern) rather than reading window.innerWidth live: this
  // re-checks the size on every open with no post-mount flash, and keeps the chosen
  // display mode stable while the form is open even if the window is resized.
  // Lazy initializer handles the deep-link case where the overlay is already open on the
  // first render (e.g. loading /module/entity/25 directly): wasOpen would equal isOpen, so
  // the flip below never fires — without this seed openWidth would stay null.
  const [openWidth, setOpenWidth] = useState<number | null>(() =>
    isOpen && typeof window !== 'undefined' ? window.innerWidth : null
  )
  const [wasOpen, setWasOpen] = useState(isOpen)
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen)
    setOpenWidth(isOpen && typeof window !== 'undefined' ? window.innerWidth : null)
  }

  // Render standalone form (with breadcrumbs, no data table)
  if (isStandalone) {
    const standaloneRecordId = standaloneViewMatch?.[1] || null
    return (
      <StandaloneFormView
        metadata={metadata}
        recordId={standaloneRecordId}
        moduleId={module_name}
        viewName={view_name}
        canEdit={canEdit}
        parentLabel={parentLabel}
        parentPath={parentPath}
        parentRecordLabel={parentRecordLabel}
        parentRecordPath={parentRecordPath}
      />
    )
  }

  // --- Overlay mode: list + sheet/dialog ---
  // (open-state detection + open-width capture computed above the early return)

  // Determine overlay display mode based on edit_mode from schema metadata.
  // 'auto' (or unset): always a sidebar — wide (two-column) on large screens with
  //   many fields, narrow otherwise.
  // 'modal': always use modal.
  // 'sidebar': always use sidebar (narrow).
  // 'page': not applicable here (handled by isStandalone above).
  //
  // "Large screen" is the Tailwind `lg` breakpoint (>= 1024px), measured against the
  // viewport width captured when the overlay opened (openWidth).
  const isLargeScreen = (openWidth ?? 0) >= 1024
  const resolveDisplayMode = (): 'modal' | 'sidebar' => {
    if (effectiveEditMode === 'modal') return 'modal'
    return 'sidebar'
  }
  const displayMode = resolveDisplayMode()
  const useModal = displayMode === 'modal'
  // Wide sidebar (~900px) renders the form in two columns via the container-query grid.
  // Only in auto mode, on a large screen, when the form has enough fields to benefit.
  const useWideSidebar =
    !useModal && effectiveEditMode !== 'sidebar' && isLargeScreen && fieldCount > 10

  const OVERLAY_FORM_ID = 'overlay-record-form'

  const childButtons = !isCreateMode && children.length > 0 && (
    <div className="flex gap-2 flex-wrap justify-end">
      {children.map((child) => (
        <Button
          key={child.id}
          type="submit"
          form={OVERLAY_FORM_ID}
          data-child-id={child.id}
        >
          {child.plural_label_parent || child.plural_label}...
        </Button>
      ))}
    </div>
  )

  const handleOverlayBeforeSubmit = (submitter: Element | null) => {
    const childId = submitter instanceof HTMLElement ? submitter.dataset.childId : undefined
    if (childId && recordId) {
      overlayPostSaveTargetRef.current = buildChildNavUrl(module_name, childId, recordId)
    } else {
      overlayPostSaveTargetRef.current = null
    }
  }

  const handleClose = () => {
    const target = overlayPostSaveTargetRef.current
    overlayPostSaveTargetRef.current = null
    if (target) {
      router.history.push(target)
    } else {
      navigatePreservingSearch({ to: view_name })
    }
  }

  // Edit route template for DataTableView (used for keyboard/link navigation)
  const editRoute = effectiveEditMode === 'page'
    ? `${view_name}/$id/view`
    : `${view_name}/$id/edit`

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1">
        <EntityBreadcrumb
          moduleId={module_name}
          entityLabel={metadata.table?.plural_label || 'Records'}
          entityPath={view_name}
          parentLabel={parentLabel}
          parentPath={parentPath}
          parentRecordLabel={parentRecordLabel}
          parentRecordPath={parentRecordPath}
        />
        <BookmarkIcon
          url={pathname}
          title={metadata.table?.plural_label || 'Records'}
          label={metadata.table?.plural_label || 'Records'}
        />
      </div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {parentRecordLabel && parentRecordPath && (
              <>
                <Link to={parentRecordPath} className="text-muted-foreground font-normal hover:underline">{parentRecordLabel}</Link>
                <span className="text-muted-foreground font-normal mx-2" aria-hidden="true">›</span>
              </>
            )}
            {metadata.table?.plural_label || 'Records'}
          </h1>
          <p className="text-muted-foreground">
            {metadata.table?.description || 'Manage records'}
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => navigateForEditMode('new')}>
            <Plus className="mr-2 h-4 w-4" />
            Add {metadata.table?.singular_label || 'Record'}
          </Button>
        )}
      </div>

      <DataTableView
        metadata={metadata}
        onRowClick={(record) => navigateForEditMode('open', record)}
        onEdit={(record) => navigateForEditMode('open', record)}
        onEditModal={(record) => navigateForEditMode('open', record)}
        // Same destinations navigateForEditMode('open') computes, expressed as an
        // href so the record's name in the grid is a real link. A row that only
        // has an onClick is unreachable by keyboard (2.1.1).
        getRowHref={(record) => {
          const id = String(record[idColumn])
          return effectiveEditMode === 'page'
            ? `${view_name}/${id}/view`
            : `${view_name}/${id}`
        }}
        rowHrefPreservesSearch={effectiveEditMode !== 'page'}
        editRoute={editRoute}
        canEdit={canEdit}
        emptyMessage={`No ${metadata.table?.plural_label?.toLowerCase() || 'records'} found`}
        emptyIcon={<Users className="h-12 w-12 mb-2" />}
        excludeColumns={['created_at', 'updated_at', ...(pfColumn ? [pfColumn] : [])]}
        getRowMenuItems={getRowMenuItems}
      />

      {/* Sheet for viewing/editing record. Wide (~900px, two-column form) on large
          screens with many fields in auto mode; otherwise the default 540px column. */}
      <Sheet open={isOpen && !useModal} onOpenChange={(open) => !open && handleClose()}>
        <SheetContent
          // NB: the override must carry the same `data-[side=right]:sm:` variant as the
          // base SheetContent class (`data-[side=right]:sm:max-w-sm`). tailwind-merge only
          // dedupes classes with identical modifiers, and the base attribute-scoped class
          // also out-specifies a plain `sm:max-w-*`. A bare `sm:max-w-[900px]` is therefore
          // silently ignored — the sidebar stays pinned at max-w-sm (384px).
          className={`data-[side=right]:w-full border-l-0 ${useWideSidebar ? 'data-[side=right]:sm:max-w-[900px]' : 'data-[side=right]:sm:max-w-[540px]'}`}
          initialFocus={false}
        >
          <SheetHeader>
            <div className="flex items-start justify-between gap-4">
              <SheetTitle>
                {isCreateMode
                  ? `New ${metadata.table?.singular_label || 'Record'}`
                  : `${metadata.table?.singular_label || 'Record'} ${recordId || ''}`}
              </SheetTitle>
              {childButtons}
            </div>
          </SheetHeader>
          {/* No bottom padding: the sticky form footer (StickyContainer) must sit flush
              with the scroll container's bottom edge. A `pb-*` here would (a) add dead
              space below the action bar and (b) make the pinned position differ from the
              resting position, causing the bar to "jump" up when scrolled to the end. */}
          <div className="flex-1 overflow-y-auto px-6">
            <DataFormPage
              schema={metadata}
              recordId={isCreateMode ? null : recordId}
              onClose={handleClose}
              formMode={isCreateMode ? 'create' : (isEditMode ? 'edit' : (canEdit ? 'edit' : 'view'))}
              formId={OVERLAY_FORM_ID}
              onBeforeSubmit={handleOverlayBeforeSubmit}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Modal for viewing/editing record - used when field count >= 10 on wide screens */}
      <Dialog open={useModal && isOpen} onOpenChange={(open) => !open && handleClose()}>
        {/* pb-0: the form's sticky footer must sit flush with the scroll edge — see the
            StickyContainer note. The dialog's base p-6 bottom padding would otherwise make
            the action bar gap/jump at the scroll end. */}
        <DialogContent className="w-full max-w-[90vw] sm:max-w-[800px] max-h-[90vh] overflow-y-auto pb-0" initialFocus={false}>
          <DialogHeader>
            <div className="flex items-start justify-between gap-4">
              <DialogTitle>
                {isCreateMode
                  ? `New ${metadata.table?.singular_label || 'Record'}`
                  : `${metadata.table?.singular_label || 'Record'} ${recordId || ''}`}
              </DialogTitle>
              {childButtons}
            </div>
          </DialogHeader>
          <DataFormPage
            schema={metadata}
            recordId={isCreateMode ? null : recordId}
            onClose={handleClose}
            formMode={isCreateMode ? 'create' : (canEdit ? 'edit' : 'view')}
            formId={OVERLAY_FORM_ID}
            onBeforeSubmit={handleOverlayBeforeSubmit}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
