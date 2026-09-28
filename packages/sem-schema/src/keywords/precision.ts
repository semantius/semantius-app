import type { ErrorObject } from 'ajv';
import Ajv from 'ajv';

/**
 * Add custom 'precision' keyword to AJV instance
 * 
 * Validates the number of decimal places in a number (0-9)
 * Example: precision: 2 allows numbers like 99.99 but rejects 99.999
 */
export function addPrecisionKeyword(ajv: Ajv): void {
  ajv.addKeyword({
    keyword: 'precision',
    type: 'number',
    schemaType: 'number',
    compile(schema: number) {
      const validateFn = function validate(data: number): boolean {
        // Validate schema value
        if (!Number.isInteger(schema) || schema < 0 || schema > 9) {
          (validate as any).errors = [{
            keyword: 'precision',
            message: 'precision must be an integer between 0 and 9',
            params: { precision: schema },
            instancePath: '',
            schemaPath: ''
          } as ErrorObject];
          return false;
        }

        // Check the number of decimal places
        // Note: Uses string conversion which may have floating-point precision issues
        // For most practical cases (currency, measurements), this is acceptable
        const decimalPart = (data.toString().split('.')[1] || '');
        if (decimalPart.length > schema) {
          (validate as any).errors = [{
            keyword: 'precision',
            message: `must have at most ${schema} decimal places`,
            params: { precision: schema, actual: decimalPart.length },
            instancePath: '',
            schemaPath: ''
          } as ErrorObject];
          return false;
        }
        return true;
      };
      return validateFn;
    },
    errors: true
  });
}
