import Ajv from 'ajv';

/**
 * Custom format validation for 'json' format
 *
 * A json value is JSON text or an already-parsed JSON value, but AJV only hands
 * strings to a format validator — an object never reaches it. The real check
 * (JSON text must parse, other values must be real JSON) therefore lives in the
 * json keyword (keywords/json.ts), which preprocessSchema attaches to every
 * property with this format and which reports what is wrong in detail. The format
 * itself is registered so the name is known to AJV, and accepts any string.
 */
export function validateJsonFormat(data: string): boolean {
  return typeof data === 'string';
}

/**
 * Add 'json' format to AJV instance
 */
export function addJsonFormat(ajv: Ajv): void {
  ajv.addFormat('json', {
    type: 'string',
    validate: validateJsonFormat
  });
}
