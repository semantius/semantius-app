import type { SchemaObject, ValidateFunction } from 'ajv';
import { createSemSchemaValidator } from './validator';
import { preprocessSchema, validateSchemaStructure } from './utils';

/**
 * Validate a JSON Schema against SemSchema vocabulary
 * 
 * @param schemaJson - The JSON Schema to validate
 * @returns Object with:
 *   - valid: boolean - true if schema is valid, false otherwise
 *   - errors: array | null - array of validation error objects if invalid, null if valid
 */
export function validateSchema(schemaJson: SchemaObject): {
  valid: boolean;
  errors: any[] | null;
} {
  // Create fresh instance for schema validation
  const ajv = createSemSchemaValidator();
  const processed = preprocessSchema(schemaJson);
  
  // First check custom keyword values with our manual validation
  const structureErrors = validateSchemaStructure(processed);
  if (structureErrors.length > 0) {
    return {
      valid: false,
      errors: structureErrors
    };
  }
  
  // Then let AJV compile and validate the schema
  try {
    ajv.compile(processed);
    return {
      valid: true,
      errors: null
    };
  } catch (error) {
    // Return AJV compilation errors in consistent format
    return {
      valid: false,
      errors: [{
        keyword: 'schema',
        message: error instanceof Error ? error.message : String(error),
        params: {},
        schemaPath: '#',
        instancePath: '#'
      }]
    };
  }
}

/**
 * Validate data against a JSON Schema using SemSchema vocabulary
 * 
 * Note: This function assumes the schema is valid. For best practice, 
 * validate the schema first using validateSchema() to catch schema errors
 * before attempting data validation.
 * 
 * @param data - The data to validate
 * @param schemaJson - The JSON Schema to validate against
 * @returns Object with:
 *   - valid: boolean - true if data is valid, false otherwise
 *   - errors: array | null - array of error objects if invalid, null if valid
 */
export function validateData(data: any, schemaJson: SchemaObject): {
  valid: boolean;
  errors: any[] | null;
} {
  // Validate schema first to catch invalid schemas before compilation
  const schemaValidation = validateSchema(schemaJson);
  if (!schemaValidation.valid) {
    const errorMessages = schemaValidation.errors?.map(e => e.message).join(', ') || 'Unknown validation error';
    throw new Error(`Invalid schema: ${errorMessages}`);
  }
  
  // Create fresh instance for each validation to avoid schema caching issues
  const ajv = createSemSchemaValidator();
  const processed = preprocessSchema(schemaJson);
  
  let validate: ValidateFunction;
  try {
    validate = ajv.compile(processed);
  } catch (error) {
    throw new Error(`Invalid schema: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  validate(data);
  let errors = validate.errors ? [...validate.errors] : null;
  
  // Filter out validation errors based on inputMode
  if (errors && schemaJson.properties && typeof data === 'object' && data !== null) {
    errors = errors.filter(error => {
      // Get the field name from the error path (e.g., '/email' -> 'email')
      const fieldName = error.instancePath.startsWith('/') 
        ? error.instancePath.substring(1) 
        : error.instancePath;
      
      if (!fieldName) return true;
      
      const fieldValue = data[fieldName];
      const propSchema = schemaJson.properties?.[fieldName];
      const inputMode = typeof propSchema === 'object' && propSchema !== null ? (propSchema as any).inputMode : undefined;
      
      // For readonly, disabled, and hidden fields: 
      // - Skip required, minLength, maxLength, pattern validation (constraints)
      // - BUT still validate format if value is present (data quality check)
      if (inputMode === 'readonly' || inputMode === 'disabled' || inputMode === 'hidden') {
        // Skip constraint validations
        if (error.keyword === 'required' || error.keyword === 'minLength' || 
            error.keyword === 'maxLength' || error.keyword === 'pattern' ||
            error.keyword === 'type') {
          return false;
        }
        
        // For format and enum: only skip if value is empty
        if (error.keyword === 'format' || error.keyword === 'enum') {
          const isEmpty = fieldValue === null || fieldValue === undefined || 
                         (typeof fieldValue === 'string' && fieldValue === '');
          if (isEmpty) {
            return false; // Skip format/enum validation for empty values
          }
          // If value is present, keep the error (validate format/enum)
        }
      }
      
      // If the value is empty string and inputMode is 'required', filter out format/enum errors
      // because inputMode validation will provide a better error message
      if (typeof fieldValue === 'string' && fieldValue === '' && inputMode === 'required') {
        if (error.keyword === 'format' || error.keyword === 'enum') {
          return false; // Filter out - inputMode will handle this
        }
      }
      
      // If the value is empty string and inputMode is NOT 'required', filter out format errors
      // (enum errors should not occur because preprocessSchema adds "" to enum arrays)
      if (typeof fieldValue === 'string' && fieldValue === '' && inputMode !== 'required') {
        if (error.keyword === 'format') {
          return false; // Filter out format errors for optional empty strings
        }
      }
      
      return true;
    });
  }
  
  // Custom validation for inputMode: "required"
  // Skip required validation for readonly, disabled, and hidden fields
  if (schemaJson.properties && typeof data === 'object' && data !== null) {
    const inputModeErrors: any[] = [];
    
    for (const [key, propSchema] of Object.entries(schemaJson.properties)) {
      if (typeof propSchema === 'object' && propSchema !== null) {
        const inputMode = (propSchema as any).inputMode;
        
        // Only validate required for default and required inputModes
        // Skip validation for readonly, disabled, and hidden fields
        if (inputMode === 'required') {
          const value = data[key];
          
          // Check if value is null, undefined, or empty string
          if (value === null || value === undefined) {
            inputModeErrors.push({
              keyword: 'inputMode',
              message: `must not be null or undefined`,
              params: { inputMode: 'required' },
              instancePath: `/${key}`,
              schemaPath: `#/properties/${key}/inputMode`
            });
          } else if (typeof value === 'string' && value === '') {
            inputModeErrors.push({
              keyword: 'inputMode',
              message: `must not be empty`,
              params: { inputMode: 'required' },
              instancePath: `/${key}`,
              schemaPath: `#/properties/${key}/inputMode`
            });
          } else if ((propSchema as any).format === 'rating' && value === 0) {
            // A rating of 0 means not rated
            inputModeErrors.push({
              keyword: 'inputMode',
              message: `must not be 0`,
              params: { inputMode: 'required' },
              instancePath: `/${key}`,
              schemaPath: `#/properties/${key}/inputMode`
            });
          }
        }
      }
    }
    
    // Merge inputMode errors with AJV errors
    if (inputModeErrors.length > 0) {
      errors = errors ? [...errors, ...inputModeErrors] : inputModeErrors;
    }
  }
  
  return {
    valid: errors === null || errors.length === 0,
    errors: errors && errors.length > 0 ? errors : null
  };
}
