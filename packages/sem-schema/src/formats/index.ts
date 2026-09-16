/**
 * Format validators for SemSchema
 *
 * Includes:
 * 1. Custom SemSchema formats (not in JSON Schema spec): json, html, text, multiline, code, jsonata, jsonlogic, reference
 * 2. email, hostname, uri, uri-reference with Unicode, and their idn/iri names, which validate the same
 */
import Ajv from 'ajv';
import { addJsonFormat } from './json';
import { addHtmlFormat } from './html';
import { addTextFormat } from './text';
import { addMultilineFormat } from './multiline';
import { addCodeFormat } from './code';
import { addJsonataFormat } from './jsonata';
import { addJsonlogicFormat } from './jsonlogic';
import { addReferenceFormat } from './reference';
import { addParentFormat } from './parent';
import { addInternationalizedFormats } from './internationalized';
import { TYPE_NAME_FORMATS } from '../utils';

export { validateJsonFormat, addJsonFormat } from './json';
export { validateHtmlFormat, addHtmlFormat } from './html';
export { validateTextFormat, addTextFormat } from './text';
export { validateMultilineFormat, addMultilineFormat } from './multiline';
export { validateCodeFormat, addCodeFormat } from './code';
export { validateJsonataFormat, addJsonataFormat } from './jsonata';
export { validateJsonlogicFormat, addJsonlogicFormat } from './jsonlogic';
export { validateReferenceFormat, addReferenceFormat } from './reference';
export { validateParentFormat, addParentFormat } from './parent';
export {
  validateEmail,
  validateHostname,
  validateUri,
  validateUriReference,
  addInternationalizedFormats
} from './internationalized';

/**
 * Add all format validators to AJV instance (after ajv-formats)
 * - Custom formats: json, html, text, multiline, code, jsonata, jsonlogic, reference, parent
 * - email, hostname, uri, uri-reference with Unicode, and idn-email, idn-hostname, iri, iri-reference
 * - JSON type names and enum, which have no check of their own
 */
export function addAllFormats(ajv: Ajv): void {
  // Custom SemSchema formats
  addJsonFormat(ajv);
  addHtmlFormat(ajv);
  addTextFormat(ajv);
  addMultilineFormat(ajv);
  addCodeFormat(ajv);
  addJsonataFormat(ajv);
  addJsonlogicFormat(ajv);
  addReferenceFormat(ajv);
  addParentFormat(ajv);
  // Standard formats accept Unicode; each validates the same as its idn/iri name
  addInternationalizedFormats(ajv);
  // The type these imply (see preprocessSchema) and the enum keyword do the validation;
  // registering them keeps AJV from warning "unknown format ... ignored" on every compile
  for (const name of [...TYPE_NAME_FORMATS, 'enum']) {
    ajv.addFormat(name, true);
  }
}
