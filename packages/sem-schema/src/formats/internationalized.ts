/**
 * email, hostname, uri and uri-reference format validators, with Unicode
 *
 * SemSchema does not restrict these standard formats to ASCII. Each validates exactly the
 * same as its internationalized counterpart, so a schema author never has to pick the
 * idn/iri name to allow Unicode:
 *   email         = idn-email      (jörg@müller.de)
 *   hostname      = idn-hostname   (müller.de)
 *   uri           = iri            (https://müller.de/straße)
 *   uri-reference = iri-reference  (/straße)
 *
 * A value is checked with the ajv-formats validator of the standard format. A value with
 * non-ASCII characters is first mapped to the ASCII form it takes on the wire: host names
 * to punycode (IDNA), other characters of a URI to UTF-8 percent-encoding (RFC 3987,
 * section 3.1), and non-ASCII characters of an email local part to a letter (RFC 6531 allows
 * them wherever RFC 5321 allows a letter). ASCII values are checked unchanged.
 */
import Ajv from 'ajv';
import { fullFormats } from 'ajv-formats/dist/formats';

const NON_ASCII = /[^\x00-\x7F]/;
const NON_ASCII_CHARACTERS = /[^\x00-\x7F]+/gu;

// Control characters, unassigned code points and whitespace never belong to these formats
const NOT_ALLOWED = /[\p{C}\p{Z}]/u;

// Characters that end a host name inside a URL: the URL parser would silently drop the rest
const NOT_IN_HOSTNAME = /[/?#@:[\]\\%]/;

// The label separators IDNA maps to "."
const LABEL_SEPARATOR = /[.。．｡]/;

function asciiValidator(name: 'email' | 'hostname' | 'uri' | 'uri-reference'): (value: string) => boolean {
  const format = fullFormats[name];
  if (format instanceof RegExp) return (value) => format.test(value);
  if (typeof format === 'function') return (value) => (format as (value: string) => boolean)(value);
  throw new Error(`ajv-formats has no validator for format "${name}"`);
}

const isAsciiEmail = asciiValidator('email');
const isAsciiHostname = asciiValidator('hostname');
const isAsciiUri = asciiValidator('uri');
const isAsciiUriReference = asciiValidator('uri-reference');

/**
 * The punycode form of a host name, or undefined when the value cannot be one
 */
function toAsciiHostname(value: string): string | undefined {
  if (!NON_ASCII.test(value)) return value;
  if (NOT_ALLOWED.test(value) || NOT_IN_HOSTNAME.test(value)) return undefined;
  // The URL parser applies IDNA but lets labels start or end with a hyphen
  if (value.split(LABEL_SEPARATOR).some((label) => label.startsWith('-') || label.endsWith('-'))) return undefined;
  try {
    return new URL(`http://${value}`).hostname;
  } catch {
    return undefined;
  }
}

/**
 * A URI or IRI with its non-ASCII characters percent-encoded as UTF-8, or undefined when
 * it contains characters no IRI may contain
 */
function toAsciiUri(value: string): string | undefined {
  if (!NON_ASCII.test(value)) return value;
  if (NOT_ALLOWED.test(value)) return undefined;
  return value.replace(NON_ASCII_CHARACTERS, (characters) => encodeURIComponent(characters));
}

export function validateEmail(value: string): boolean {
  if (!NON_ASCII.test(value)) return isAsciiEmail(value);
  const at = value.lastIndexOf('@');
  if (at < 1) return false;
  const localPart = value.slice(0, at);
  const domain = toAsciiHostname(value.slice(at + 1));
  if (domain === undefined || NOT_ALLOWED.test(localPart)) return false;
  return isAsciiEmail(`${localPart.replace(NON_ASCII_CHARACTERS, (characters) => 'a'.repeat([...characters].length))}@${domain}`);
}

export function validateHostname(value: string): boolean {
  const ascii = toAsciiHostname(value);
  return ascii !== undefined && isAsciiHostname(ascii);
}

export function validateUri(value: string): boolean {
  const ascii = toAsciiUri(value);
  return ascii !== undefined && isAsciiUri(ascii);
}

export function validateUriReference(value: string): boolean {
  const ascii = toAsciiUri(value);
  return ascii !== undefined && isAsciiUriReference(ascii);
}

/**
 * Register email, hostname, uri and uri-reference and their idn/iri names. Must run after
 * ajv-formats, whose ASCII-only validators for the standard names it replaces.
 */
export function addInternationalizedFormats(ajv: Ajv): void {
  ajv.addFormat('email', validateEmail);
  ajv.addFormat('idn-email', validateEmail);
  ajv.addFormat('hostname', validateHostname);
  ajv.addFormat('idn-hostname', validateHostname);
  ajv.addFormat('uri', validateUri);
  ajv.addFormat('iri', validateUri);
  ajv.addFormat('uri-reference', validateUriReference);
  ajv.addFormat('iri-reference', validateUriReference);
}
