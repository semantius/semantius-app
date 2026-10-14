import Ajv from 'ajv';

/**
 * Custom format validation for 'rating' format
 * Validates that a value is an integer from 0 to 5 (0 means not rated)
 */
export function validateRatingFormat(data: any): boolean {
  return Number.isInteger(data) && data >= 0 && data <= 5;
}

/**
 * Add 'rating' format to AJV instance
 */
export function addRatingFormat(ajv: Ajv): void {
  ajv.addFormat('rating', {
    type: 'number',
    validate: validateRatingFormat
  });
}
