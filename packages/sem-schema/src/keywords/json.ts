import type { ErrorObject } from 'ajv';
import Ajv from 'ajv';
import { validateJson, type JsonIssue } from '../json/validate';

/**
 * Internal keyword that validates values of `format: "json"`.
 *
 * Schema authors do not write it: preprocessSchema adds it next to the format. A
 * keyword is needed because AJV only passes strings to format validators, and a
 * json value is usually an object or array.
 */
export const JSON_KEYWORD = 'x-sem-json';

/**
 * Report issues as `format` errors (params.format = the format name), so consumers
 * treat them like any other format error — validateData's inputMode filtering and
 * message localizers included. The message says what is wrong and where.
 */
export function toFormatErrors(format: string, issues: JsonIssue[]): Partial<ErrorObject>[] {
  return issues.map((issue) => ({
    keyword: 'format',
    message: issue.path ? `${issue.message} at ${issue.path}` : issue.message,
    params: { format, path: issue.path }
  }));
}

export function addJsonKeyword(ajv: Ajv): void {
  ajv.addKeyword({
    keyword: JSON_KEYWORD,
    schemaType: 'boolean',
    compile(enabled: boolean) {
      const validateFn = function validate(data: unknown): boolean {
        if (!enabled) return true;
        const issues = validateJson(data);
        if (issues.length === 0) return true;
        (validate as any).errors = toFormatErrors('json', issues);
        return false;
      };
      return validateFn;
    },
    errors: true
  });
}
