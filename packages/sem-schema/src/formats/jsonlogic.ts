import Ajv from 'ajv';

/**
 * Custom format validation for 'jsonlogic' format
 *
 * A JsonLogic value is stored as JSON (an object, an array or a literal), but AJV
 * only hands strings to a format validator — an object never reaches it. The real
 * check therefore lives in the jsonlogic keyword (keywords/jsonlogic.ts), which
 * preprocessSchema attaches to every property with this format. The format itself
 * is registered so the name is known to AJV, and accepts any string.
 */
export function validateJsonlogicFormat(data: string): boolean {
  return typeof data === 'string';
}

/**
 * Add 'jsonlogic' format to AJV instance
 */
export function addJsonlogicFormat(ajv: Ajv): void {
  ajv.addFormat('jsonlogic', {
    type: 'string',
    validate: validateJsonlogicFormat
  });
}
