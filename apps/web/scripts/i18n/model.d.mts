/**
 * Types for `model.mjs` — see `translate.d.mts` for why the scripts are plain
 * ESM with declarations beside them.
 */

import type { FieldRow, ModelRows, ModuleRow, TableRow } from './labelInventory.d.mts'
import type { TenantConnection } from './tenant.d.mts'

export type { FieldRow, ModelRows, ModuleRow, TableRow }

/** Read `tables`, `fields` and `modules` over PostgREST. */
export declare function readModel(conn: TenantConnection): Promise<Required<ModelRows>>
