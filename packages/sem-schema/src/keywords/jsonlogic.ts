import Ajv from 'ajv';
import { validateJsonLogic } from '../jsonlogic/validate';
import { toFormatErrors } from './json';

/**
 * Internal keyword that validates values of `format: "jsonlogic"`.
 *
 * Schema authors do not write it: preprocessSchema adds it next to the format. A
 * keyword is needed because AJV only passes strings to format validators, and a
 * JsonLogic rule is usually an object or array.
 *
 * Errors are reported as `format` errors (params.format = "jsonlogic"); see toFormatErrors.
 */
export const JSONLOGIC_KEYWORD = 'x-sem-jsonlogic';

export function addJsonlogicKeyword(ajv: Ajv): void {
  ajv.addKeyword({
    keyword: JSONLOGIC_KEYWORD,
    schemaType: 'boolean',
    compile(enabled: boolean) {
      const validateFn = function validate(data: unknown): boolean {
        if (!enabled) return true;
        const issues = validateJsonLogic(data);
        if (issues.length === 0) return true;
        (validate as any).errors = toFormatErrors('jsonlogic', issues);
        return false;
      };
      return validateFn;
    },
    errors: true
  });
}
