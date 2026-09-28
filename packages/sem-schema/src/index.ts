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

// Types
export type { SchemaValidationError } from './utils';
