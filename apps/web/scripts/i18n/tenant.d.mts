/**
 * Types for `tenant.mjs` — see `translate.d.mts` for why the scripts are plain
 * ESM with declarations beside them.
 */

import type { TranslationRow } from './localeFile.d.mts'

/** A resolved tenant: where its PostgREST is, and a bearer token for it. */
export interface TenantConnection {
  apiUrl: string
  token: string
}

export interface PgrestResult {
  ok: boolean
  status: number
  body: unknown
  /** PostgREST's own error code, when the body carried one. */
  code?: string
  headers: Headers
}

export declare const ABSENT_CODES: Set<string>
export declare const TRANSLATIONS_TABLE: string
export declare const TABLE_ABSENT_MESSAGE: string

export declare function argValue(argv: readonly string[], flag: string): string | undefined
export declare function connectTenant(argv?: readonly string[]): Promise<TenantConnection>
export declare function pgrest(
  conn: TenantConnection,
  path: string,
  init?: RequestInit,
): Promise<PgrestResult>
export declare function readAll<T = Record<string, unknown>>(
  conn: TenantConnection,
  table: string,
  query: string,
  pageSize?: number,
): Promise<{ rows: T[] | null; absent: boolean; result?: PgrestResult }>
export declare function upsertTranslations(
  conn: TenantConnection,
  rows: readonly TranslationRow[],
  batchSize?: number,
): Promise<{ written: number; absent: boolean }>
