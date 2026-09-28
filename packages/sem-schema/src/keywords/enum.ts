import type { ErrorObject } from 'ajv';
import Ajv from 'ajv';
import ajvEqual from 'ajv/dist/runtime/equal';

// The deep equality AJV's own enum uses; its typings declare a namespace, not the function
const equal = ajvEqual as unknown as (a: unknown, b: unknown) => boolean;

/**
 * The value of an `enum` entry. An entry is a plain value ("active") or a value with
 * its display label ({"value": "on_hold", "label": "On hold"}), like enum_values in
 * the Semantius backend. The shape of the entries is checked by vocabulary.json.
 */
export function enumEntryValue(entry: unknown): unknown {
  return typeof entry === 'object' && entry !== null && !Array.isArray(entry)
    ? (entry as { value: unknown }).value
    : entry;
}

/**
 * Replace AJV's built-in 'enum' keyword with one that understands {value, label} entries
 *
 * Data must equal the value of one entry; the labels are for the UI only. The labels stay
 * in the schema because the form reads them from there.
 */
export function addEnumKeyword(ajv: Ajv): void {
  ajv.removeKeyword('enum');
  ajv.addKeyword({
    keyword: 'enum',
    schemaType: 'array',
    compile(entries: unknown[]) {
      const allowedValues = entries.map(enumEntryValue);
      const validateFn = function validate(data: unknown): boolean {
        if (allowedValues.some((value) => equal(value, data))) {
          return true;
        }
        // No instancePath: AJV adds the path of the value
        (validate as any).errors = [{
          keyword: 'enum',
          message: 'must be equal to one of the allowed values',
          params: { allowedValues }
        } as Partial<ErrorObject>];
        return false;
      };
      return validateFn;
    },
    errors: true
  });
}
