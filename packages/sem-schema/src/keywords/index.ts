/**
 * Custom keywords for sem-schema vocabulary
 */
import Ajv from 'ajv';
import { addPrecisionKeyword } from './precision';
import { addJsonKeyword } from './json';
import { addJsonlogicKeyword } from './jsonlogic';

export { addPrecisionKeyword } from './precision';
export { addJsonKeyword, JSON_KEYWORD } from './json';
export { addJsonlogicKeyword, JSONLOGIC_KEYWORD } from './jsonlogic';

/**
 * Add all custom keywords to AJV instance
 */
export function addAllKeywords(ajv: Ajv): void {
  addPrecisionKeyword(ajv);
  addJsonKeyword(ajv);
  addJsonlogicKeyword(ajv);
}
