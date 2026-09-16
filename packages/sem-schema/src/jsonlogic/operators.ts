/**
 * JsonLogic operators understood by the Semantius backend.
 *
 * Mirrors `evaluate_json_logic(rule jsonb, data jsonb)` in the semantius repo. The
 * function is defined in apps/_core/migrations/0015_jsonlogic.sql and REPLACED in
 * full by apps/_core/migrations/0210_raci.sql, so the later definition is the one
 * that runs. Keep this table in step with that definition:
 * src/__tests__/jsonlogic-backend-sync.test.ts fails when the two disagree.
 *
 * Argument counts follow the backend's behaviour, and are errors where a rule is
 * legal but almost certainly wrong (e.g. `>=` with a third argument, which the
 * backend ignores rather than treating as "between").
 */

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/** How the operator treats its arguments; drives the recursive walk. */
export type ArgumentMode =
  /** every argument is evaluated against the current data */
  | 'evaluated'
  /** `let`: [name (raw), value, body] — body sees `name` bound */
  | 'let'
  /** `set_record`: [name (raw), entity (raw), id, body] — body sees `name` bound */
  | 'set_record'
  /** map/filter/all/none/some/reduce: argument 1 is evaluated per array item, not against the record */
  | 'scoped';

export interface OperatorSpec {
  min: number;
  max: number;
  args: ArgumentMode;
}

const ANY = Number.POSITIVE_INFINITY;

const op = (min: number, max: number, args: ArgumentMode = 'evaluated'): OperatorSpec => ({ min, max, args });

export const JSONLOGIC_OPERATORS: Readonly<Record<string, OperatorSpec>> = {
  // Accessing data
  var: op(0, 2),
  missing: op(0, ANY),
  missing_some: op(2, 2),

  // Logic and boolean
  if: op(1, ANY),
  '?:': op(1, ANY),
  '==': op(2, 2),
  '===': op(2, 2),
  '!=': op(2, 2),
  '!==': op(2, 2),
  '!': op(1, 1),
  '!!': op(1, 1),
  and: op(1, ANY),
  or: op(1, ANY),

  // Numeric
  '>': op(2, 2),
  '>=': op(2, 2),
  '<': op(2, 3),
  '<=': op(2, 3),
  max: op(1, ANY),
  min: op(1, ANY),
  '+': op(1, ANY),
  '-': op(1, 2),
  '*': op(1, ANY),
  '/': op(2, 2),
  '%': op(2, 2),

  // Arrays
  map: op(2, 2, 'scoped'),
  filter: op(2, 2, 'scoped'),
  reduce: op(2, 3, 'scoped'),
  all: op(2, 2, 'scoped'),
  none: op(2, 2, 'scoped'),
  some: op(2, 2, 'scoped'),
  merge: op(0, ANY),
  in: op(2, 2),

  // Strings
  cat: op(0, ANY),
  substr: op(2, 3),

  // Misc
  log: op(1, 1),

  // Semantius extensions
  let: op(3, 3, 'let'),
  set_record: op(4, 4, 'set_record'),
  has_permission: op(1, 1),
  require_permission: op(1, 1),
  value_changed: op(1, 1),
  concat: op(0, ANY),
  is_match: op(2, 2),
  throw_error: op(1, 3),
  is_raci_actor: op(3, 3),
  has_consultation: op(3, 3),
};

/**
 * Variables the backend injects into the rule data (0180_computed_validation.sql):
 * `$today`, `$now`, `$user_id` everywhere; `$old` and `$mode` for computed fields
 * and validation rules. Any other `$` name resolves to null.
 */
export const RESERVED_VARIABLES: readonly string[] = ['$today', '$now', '$user_id', '$old', '$mode'];

/** `throw_error` parameter names the backend reserves for the error hint. */
export const RESERVED_ERROR_PARAMETERS: readonly string[] = ['hint', 'code', 'entity', 'rule', 'field'];

/** RACI letters accepted by `is_raci_actor` (raci_assignments.raci enum in 0210_raci.sql). */
export const RACI_LETTERS: readonly string[] = ['responsible', 'accountable', 'consulted', 'informed'];
