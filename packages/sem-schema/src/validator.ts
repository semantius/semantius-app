import Ajv2020 from 'ajv/dist/2020';
import type Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { addAllFormats } from './formats';
import { addAllKeywords } from './keywords';
import vocabularySchema from './vocabulary.json';

/**
 * Create and configure AJV instance with SemSchema vocabulary
 * 
 * This instance supports:
 * - Custom formats: json, html, text
 * - Standard formats: date, time, email, uri, etc. (from ajv-formats)
 * - inputMode: Controls UI state and validation (required/readonly/disabled/hidden)
 * - Number precision keyword (0-9 decimal places)
 * - Type inference (format without type defaults to string)
 */
export function createSemSchemaValidator(): Ajv {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    validateFormats: true,
    validateSchema: true,  // Enable AJV meta-schema validation
    defaultMeta: vocabularySchema.$id  // Use our vocabulary as default meta-schema
  });
  
  // Register our custom vocabulary meta-schema
  ajv.addMetaSchema(vocabularySchema);
  
  // Add standard formats (date, time, email, uri, etc.)
  addFormats(ajv);
  
  // Add all custom formats
  addAllFormats(ajv);
  
  // Add all custom keywords
  addAllKeywords(ajv);
  
  return ajv;
}
