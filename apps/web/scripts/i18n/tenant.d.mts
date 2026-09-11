/**
 * Types for `tenant.mjs` — see `translate.d.mts` for why the scripts are plain
 * ESM with declarations beside them.
 */

import type { TranslationMap } from '../../src/i18n/catalog'

/** A resolved target: where its endpoint is, and a bearer token where it wants one. */
export interface TargetConnection {
  baseUrl: string
  token?: string
}

export interface TranslationMessage {
  locale: string
  key: string
  translation: string
}

export declare const ABSENT_CODES: Set<string>
export declare const TARGET_ABSENT_MESSAGE: string

export declare function argValue(argv: readonly string[], flag: string): string | undefined
export declare function connectTarget(argv?: readonly string[]): Promise<TargetConnection>
export declare function readRecord(
  conn: TargetConnection,
  locale: string,
): Promise<{ record: TranslationMap | null; absent: boolean }>
export declare function writeMessage(conn: TargetConnection, message: TranslationMessage): Promise<void>
