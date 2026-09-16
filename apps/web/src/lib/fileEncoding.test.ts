import { describe, it, expect } from 'vitest'
import {
  base64ToBytes,
  bytesToBase64,
  bytesToHexBytea,
  decodeBytes,
  encodeBytes,
  hexByteaToBytes,
  MAX_FILE_BYTES,
} from './fileEncoding'

// "Hi", a newline, a NUL and a high byte — the three things a naive text round
// trip loses.
const SAMPLE = new Uint8Array([0x48, 0x69, 0x0a, 0x00, 0xff])
/** PostgREST's hex output format: a backslash, an x, then two digits per byte. */
const HEX_PREFIX = String.fromCharCode(92) + 'x'
const SAMPLE_HEX = `${HEX_PREFIX}48690a00ff`
const SAMPLE_B64 = 'SGkKAP8='

describe('bytea hex', () => {
  it('writes the wire format PostgREST reads back', () => {
    // Verified against the tenant: a BYTEA column round-trips this string
    // unchanged, lowercase hex and all.
    expect(bytesToHexBytea(SAMPLE)).toBe(SAMPLE_HEX)
  })

  it('round-trips', () => {
    expect(hexByteaToBytes(bytesToHexBytea(SAMPLE))).toEqual(SAMPLE)
  })

  it('reads a value with or without the prefix', () => {
    expect(hexByteaToBytes('48690a00ff')).toEqual(SAMPLE)
  })

  it('encodes an empty value as the bare prefix', () => {
    expect(bytesToHexBytea(new Uint8Array())).toBe(HEX_PREFIX)
    expect(hexByteaToBytes(HEX_PREFIX)).toEqual(new Uint8Array())
  })

  it.each([`${HEX_PREFIX}4`, `${HEX_PREFIX}zz`, 'not hex at all'])('refuses %p', (value) => {
    expect(hexByteaToBytes(value)).toBeUndefined()
  })
})

describe('base64', () => {
  it('writes what the column holds', () => {
    expect(bytesToBase64(SAMPLE)).toBe(SAMPLE_B64)
  })

  it('round-trips', () => {
    expect(base64ToBytes(bytesToBase64(SAMPLE))).toEqual(SAMPLE)
  })

  it('answers undefined for something that is not base64', () => {
    expect(base64ToBytes('not base64!!')).toBeUndefined()
  })
})

describe('encodeBytes / decodeBytes', () => {
  it('picks the encoding from the format', () => {
    expect(encodeBytes(SAMPLE, 'binary')).toBe(SAMPLE_HEX)
    expect(encodeBytes(SAMPLE, 'byte')).toBe(SAMPLE_B64)
    expect(decodeBytes(SAMPLE_HEX, 'binary')).toEqual(SAMPLE)
    expect(decodeBytes(SAMPLE_B64, 'byte')).toEqual(SAMPLE)
  })

  it('treats an empty value as no file', () => {
    expect(decodeBytes('', 'binary')).toBeUndefined()
    expect(decodeBytes('', 'byte')).toBeUndefined()
  })

  it('survives a file large enough to overflow a spread call', () => {
    // The reason both encoders chunk: `String.fromCharCode(...bytes)` spreads
    // every byte into an argument list, and the call stack gives out long
    // before 5 MB. A megabyte is past the limit on every engine.
    const big = new Uint8Array(1_000_000).fill(0xab)
    expect(() => bytesToBase64(big)).not.toThrow()
    expect(bytesToHexBytea(big)).toHaveLength(2 + big.length * 2)
    expect(base64ToBytes(bytesToBase64(big))).toEqual(big)
  })

  it('caps uploads at 5 MB', () => {
    expect(MAX_FILE_BYTES).toBe(5 * 1024 * 1024)
  })
})
