/**
 * Wire encodings for the two binary formats in the catalog.
 *
 * `binary` is a PostgreSQL `BYTEA` column (`format_to_data_type` in the
 * backend's `0070_dd_functions.sql`), which PostgREST reads and writes as the
 * `hex` output format: a `\x` prefix followed by two hex digits per byte.
 * `byte` has no special column type — it falls through to `TEXT` — and carries
 * base64, which is what the JSON Schema `byte` format means.
 *
 * Both directions are chunked. A 5 MB file is 5 million elements, and
 * `String.fromCharCode(...bytes)` spreads every one of them into an argument
 * list, which overflows the call stack long before that.
 */

/** Bytes per chunk. Comfortably under the argument-count limit of any engine. */
const CHUNK = 0x8000

/** The largest file this app will encode into a form value. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024

const HEX_PREFIX = '\\x'

export function bytesToHexBytea(bytes: Uint8Array): string {
  let out = HEX_PREFIX
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const chunk = bytes.subarray(i, i + CHUNK)
    let s = ''
    for (const b of chunk) s += b.toString(16).padStart(2, '0')
    out += s
  }
  return out
}

export function hexByteaToBytes(value: string): Uint8Array | undefined {
  const hex = value.startsWith(HEX_PREFIX) ? value.slice(HEX_PREFIX.length) : value
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) return undefined
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return bytes
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

export function base64ToBytes(value: string): Uint8Array | undefined {
  try {
    const binary = atob(value)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    // Not base64 — the column holds something this control did not write.
    return undefined
  }
}

/** The two binary formats, and how each moves between bytes and a form value. */
export type BinaryFormat = 'binary' | 'byte'

export function encodeBytes(bytes: Uint8Array, format: BinaryFormat): string {
  return format === 'binary' ? bytesToHexBytea(bytes) : bytesToBase64(bytes)
}

export function decodeBytes(value: string, format: BinaryFormat): Uint8Array | undefined {
  if (value === '') return undefined
  return format === 'binary' ? hexByteaToBytes(value) : base64ToBytes(value)
}
