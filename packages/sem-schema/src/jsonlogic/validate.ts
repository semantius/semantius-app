/**
 * Static validation of JsonLogic values for the `jsonlogic` format.
 *
 * Checks a rule without running it, against the operator set of the Semantius
 * backend (see ./operators.ts). Accepted values:
 *
 * - a rule: any JsonLogic value, e.g. `{"==": [{"var": "status"}, "open"]}`
 * - an array of computed-field entries: `[{"name": "...", "jsonlogic": <rule>}]`
 * - an array of validation-rule entries: `[{"code": "99001", "message": "...", "jsonlogic": <rule>}]`
 *
 * A string is JSON text (as an editor hands it back) and is parsed first; any
 * other value must be real JSON (see ../json/validate.ts).
 * `null`, `""` and `{}` mean "no rule" and are valid.
 */
import { checkJsonValue, parseJsonText, pointer, type JsonIssue } from '../json/validate';
import {
  JSONLOGIC_OPERATORS,
  RACI_LETTERS,
  RESERVED_ERROR_PARAMETERS,
  RESERVED_VARIABLES,
  type JsonValue,
} from './operators';

export type JsonLogicIssue = JsonIssue;

interface Scope {
  /** names bound by an enclosing let / set_record within the current data scope */
  bound: ReadonlySet<string>;
  /**
   * Set inside map/filter/all/none/some/reduce logic. The backend evaluates that logic
   * against the array item ({current, accumulator} for reduce) instead of the record,
   * so `$` variables and names bound outside the operator do not exist there.
   */
  arrayOperation?: { operator: string; outerBound: ReadonlySet<string> };
}

type JsonObject = { [key: string]: JsonValue };

const ROOT_SCOPE: Scope = { bound: new Set() };

const isObject = (value: unknown): value is JsonObject =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** A single-key object is an operation, evaluated at runtime: its literal type is unknown. */
const isOperation = (value: unknown): boolean => isObject(value) && Object.keys(value).length === 1;

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

const quoteList = (values: readonly string[]): string => values.map((v) => `"${v}"`).join(', ');

export function validateJsonLogic(input: unknown): JsonLogicIssue[] {
  let value: unknown = input;
  if (typeof input === 'string') {
    if (input.trim() === '') return [];
    const parsed = parseJsonText(input);
    if (!parsed.ok) return [parsed.issue];
    value = parsed.value;
  } else {
    const jsonIssues = checkJsonValue(input);
    if (jsonIssues.length > 0) return jsonIssues;
  }

  const issues: JsonLogicIssue[] = [];
  const entryKind = detectEntryKind(value);
  if (entryKind) {
    validateEntries(value as JsonValue[], entryKind, issues);
  } else {
    walk(value as JsonValue, '', ROOT_SCOPE, issues);
  }
  return issues;
}

/**
 * computed_fields and validation_rules are arrays of entry objects that carry the rule
 * under `jsonlogic`. An entry is multi-key by design, so it must not be walked as a rule.
 */
function detectEntryKind(value: unknown): 'computed_fields' | 'validation_rules' | undefined {
  if (!Array.isArray(value) || !value.some((entry) => isObject(entry) && 'jsonlogic' in entry)) {
    return undefined;
  }
  return value.some((entry) => isObject(entry) && ('code' in entry || 'message' in entry))
    ? 'validation_rules'
    : 'computed_fields';
}

function validateEntries(entries: JsonValue[], kind: 'computed_fields' | 'validation_rules', issues: JsonLogicIssue[]): void {
  entries.forEach((entry, index) => {
    const path = pointer('', index);
    if (!isObject(entry)) {
      issues.push({ path, message: `${kind} entry must be an object` });
      return;
    }

    if (kind === 'computed_fields') {
      if (!isNonEmptyString(entry.name)) {
        issues.push({ path: pointer(path, 'name'), message: 'must be a non-empty string' });
      }
    } else {
      // The backend reads the code as text, so 99001 and "99001" are equivalent.
      const code = typeof entry.code === 'number' ? String(entry.code) : entry.code;
      const platform = entry.source_module === 'platform';
      if (typeof code !== 'string' || !(platform ? /^90\d{3}$/ : /^99\d{3}$/).test(code)) {
        issues.push({
          path: pointer(path, 'code'),
          message: platform
            ? 'must be a class 90 error code (90000-90999) for a platform rule'
            : 'must be a class 99 error code (99000-99999)',
        });
      }
      if (typeof entry.message !== 'string') {
        issues.push({ path: pointer(path, 'message'), message: 'must be a string' });
      }
    }

    if (!('jsonlogic' in entry)) {
      issues.push({ path: pointer(path, 'jsonlogic'), message: 'is required' });
    } else {
      walk(entry.jsonlogic, pointer(path, 'jsonlogic'), ROOT_SCOPE, issues);
    }
  });
}

function walk(node: JsonValue, path: string, scope: Scope, issues: JsonLogicIssue[]): void {
  if (Array.isArray(node)) {
    node.forEach((child, index) => walk(child, pointer(path, index), scope, issues));
    return;
  }
  if (!isObject(node)) return;

  const keys = Object.keys(node);
  if (keys.length === 0) return;
  if (keys.length > 1) {
    issues.push({
      path,
      message: `object has ${keys.length} keys (${quoteList(keys)}); an operation must have exactly one key, otherwise the object is a literal value that is always truthy`,
    });
    return;
  }

  const operator = keys[0];
  const raw = node[operator];
  // Both runtimes wrap a non-array argument: {"var": "a"} is {"var": ["a"]}.
  const args: JsonValue[] = Array.isArray(raw) ? raw : [raw];
  const argsPath = pointer(path, operator);
  const argPath = (index: number) => (Array.isArray(raw) ? pointer(argsPath, index) : argsPath);

  const spec = JSONLOGIC_OPERATORS[operator];
  if (!spec) {
    const suggestion = closestOperator(operator);
    issues.push({
      path,
      message: `unknown operator "${operator}"${suggestion ? ` (did you mean "${suggestion}"?)` : ''}`,
    });
    args.forEach((arg, index) => walk(arg, argPath(index), scope, issues));
    return;
  }

  if (args.length < spec.min || args.length > spec.max) {
    issues.push({ path: argsPath, message: `"${operator}" ${describeArity(spec.min, spec.max)}, got ${args.length}` });
  }

  checkArguments(operator, args, argPath, scope, issues);

  args.forEach((arg, index) => {
    switch (spec.args) {
      case 'let':
        if (index === 0) return; // raw variable name
        walk(arg, argPath(index), index === 2 ? bind(scope, args[0]) : scope, issues);
        return;
      case 'set_record':
        if (index <= 1) return; // raw variable name and entity name
        walk(arg, argPath(index), index === 3 ? bind(scope, args[0]) : scope, issues);
        return;
      case 'scoped':
        walk(arg, argPath(index), index === 1 ? arrayOperationScope(scope, operator) : scope, issues);
        return;
      default:
        walk(arg, argPath(index), scope, issues);
    }
  });
}

function checkArguments(
  operator: string,
  args: JsonValue[],
  argPath: (index: number) => string,
  scope: Scope,
  issues: JsonLogicIssue[],
): void {
  const has = (index: number) => index < args.length;
  /** Check a literal argument; an operation there is evaluated at runtime and not checked. */
  const expectLiteral = (index: number, valid: (value: JsonValue) => boolean, expected: string) => {
    if (has(index) && !isOperation(args[index]) && !valid(args[index])) {
      issues.push({ path: argPath(index), message: `must be ${expected}` });
    }
  };
  /** Check a raw argument: the backend reads it as text without evaluating it, so it must be a literal. */
  const expectRawString = (index: number, expected: string) => {
    if (has(index) && !isNonEmptyString(args[index])) {
      issues.push({ path: argPath(index), message: `must be ${expected} (it is not evaluated)` });
    }
  };

  switch (operator) {
    case 'var': {
      expectLiteral(0, (v) => v === null || typeof v === 'string' || typeof v === 'number', 'a string path, a number or null');
      const name = args[0];
      if (typeof name === 'string' && name !== '') {
        const message = checkVariable(name.split('.')[0], scope);
        if (message) issues.push({ path: argPath(0), message });
      }
      return;
    }
    case 'missing_some':
      expectLiteral(0, (v) => typeof v === 'number', 'a number');
      expectLiteral(1, Array.isArray, 'an array of keys');
      return;
    case 'let':
      expectRawString(0, 'a non-empty variable name');
      return;
    case 'set_record':
      expectRawString(0, 'a non-empty variable name');
      expectRawString(1, 'an entity name');
      return;
    case 'has_permission':
    case 'require_permission':
      expectLiteral(0, isNonEmptyString, 'a permission name');
      return;
    case 'value_changed':
      expectLiteral(0, isNonEmptyString, 'a field name');
      return;
    case 'is_match':
      expectLiteral(1, (v) => typeof v === 'string', 'a regular expression string');
      return;
    case 'is_raci_actor':
      expectLiteral(0, isNonEmptyString, 'an entity name');
      expectLiteral(1, (v) => typeof v === 'string', 'a state name');
      expectLiteral(2, (v) => typeof v === 'string' && RACI_LETTERS.includes(v), `one of ${quoteList(RACI_LETTERS)}`);
      return;
    case 'has_consultation':
      expectLiteral(0, isNonEmptyString, 'an entity name');
      expectLiteral(1, (v) => typeof v === 'string', 'a state name');
      return;
    case 'throw_error':
      checkThrowError(args, argPath, issues);
      return;
  }
}

/** Mirrors the checks `throw_error` makes when it raises (0210_raci.sql). */
function checkThrowError(args: JsonValue[], argPath: (index: number) => string, issues: JsonLogicIssue[]): void {
  if (args.length > 1 && !isOperation(args[1])) {
    const code = args[1];
    const valid =
      code === null ||
      (typeof code === 'string' && /^99\d{3}$/.test(code)) ||
      (typeof code === 'number' && Number.isInteger(code) && code >= 99000 && code <= 99999);
    if (!valid) {
      issues.push({ path: argPath(1), message: 'must be a class 99 error code (99000-99999)' });
    }
  }

  if (args.length > 2 && !isOperation(args[2])) {
    const params = args[2];
    const paramsPath = argPath(2);
    if (!Array.isArray(params)) {
      issues.push({ path: paramsPath, message: 'must be a flat [name, value, ...] array' });
      return;
    }
    if (params.length % 2 !== 0) {
      issues.push({ path: paramsPath, message: 'must contain name, value pairs (an even number of items)' });
    }
    for (let i = 0; i < params.length; i += 2) {
      const name = params[i];
      if (typeof name === 'string' && RESERVED_ERROR_PARAMETERS.includes(name)) {
        issues.push({ path: pointer(paramsPath, i), message: `"${name}" is a reserved parameter name` });
      } else if (typeof name !== 'string' && !isOperation(name)) {
        issues.push({ path: pointer(paramsPath, i), message: 'parameter name must be a string' });
      }
      const value = params[i + 1];
      if (Array.isArray(value)) {
        issues.push({ path: pointer(paramsPath, i + 1), message: 'parameter value must be a scalar' });
      }
    }
  }
}

/** Why a `var` root name resolves to nothing at runtime, or undefined when it can resolve. */
function checkVariable(root: string, scope: Scope): string | undefined {
  if (scope.bound.has(root)) return undefined;

  const array = scope.arrayOperation;
  if (array) {
    const data = array.operator === 'reduce' ? '{current, accumulator}' : 'each array item';
    if (root.startsWith('$')) {
      return `variable "${root}" is not available inside "${array.operator}" logic, which is evaluated against ${data}`;
    }
    if (array.outerBound.has(root)) {
      return `"${root}" is bound outside "${array.operator}" and is not available inside its logic, which is evaluated against ${data}`;
    }
    return undefined; // a field of the array item
  }

  if (root.startsWith('$') && !RESERVED_VARIABLES.includes(root)) {
    return `unknown variable "${root}" (available: ${quoteList(RESERVED_VARIABLES)})`;
  }
  return undefined;
}

function bind(scope: Scope, name: JsonValue): Scope {
  if (typeof name !== 'string') return scope;
  return { ...scope, bound: new Set([...scope.bound, name]) };
}

/** Logic of map/filter/all/none/some/reduce: a fresh data scope, remembering what was bound outside. */
function arrayOperationScope(scope: Scope, operator: string): Scope {
  const outerBound = new Set([...(scope.arrayOperation?.outerBound ?? []), ...scope.bound]);
  return { bound: new Set(), arrayOperation: { operator, outerBound } };
}

function describeArity(min: number, max: number): string {
  if (min === max) return `expects ${min} argument${min === 1 ? '' : 's'}`;
  if (max === Number.POSITIVE_INFINITY) return `expects at least ${min} argument${min === 1 ? '' : 's'}`;
  return `expects ${min} to ${max} arguments`;
}

function closestOperator(name: string): string | undefined {
  let best: string | undefined;
  let bestDistance = 3; // suggest only close matches
  for (const candidate of Object.keys(JSONLOGIC_OPERATORS)) {
    const distance = levenshtein(name, candidate);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[b.length];
}
