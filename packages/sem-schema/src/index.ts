/**
 * SemSchema: Custom JSON Schema Vocabulary
 * 
 * A custom JSON Schema vocabulary with additional validation features:
 * - Custom formats: json, html, text, multiline
 * - Property-level required (validates non-empty strings)
 * - Number precision (0-9 decimal places)
 * - Type inference (format without type defaults to string)
 */

// Main API
export { validateSchema, validateData } from './api';

// The date vocabulary of JsonLogic, shared with the browser evaluator
export { DATE_DURATION, DATE_FORMAT_PATTERN, DATE_FORMAT_TOKEN, DATE_PARTS, DATE_UNITS } from './jsonlogic/operators';

// Types
export type { SchemaValidationError } from './utils';
