/**
 * JSON value validation shared by the `json` and `jsonlogic` formats.
 *
 * A value is either JSON text (a string, as an editor hands it back) that must
 * parse, or an already-parsed value that must be real JSON at any depth: no
 * undefined, NaN, Infinity, functions, symbols, BigInt, class instances (Date,
 * Map, ...) or circular references.
 */

export interface JsonIssue {
  /** JSON pointer to the offending node, relative to the validated value ('' = the value itself) */
  path: string;
  message: string;
}

export type JsonParseResult = { ok: true; value: unknown } | { ok: false; issue: JsonIssue };

export const pointer = (path: string, segment: string | number): string =>
  `${path}/${String(segment).replace(/~/g, '~0').replace(/\//g, '~1')}`;

/** Parse JSON text, reporting the parser's own explanation when it fails. */
export function parseJsonText(text: string): JsonParseResult {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, issue: { path: '', message: `must be valid JSON: ${reason}` } };
  }
}

/** Validate a `json` value: JSON text must parse, any other value must be real JSON. */
export function validateJson(input: unknown): JsonIssue[] {
  if (typeof input === 'string') {
    const parsed = parseJsonText(input);
    return parsed.ok ? [] : [parsed.issue];
  }
  return checkJsonValue(input);
}

/** Report every part of an already-parsed value that JSON cannot represent. */
export function checkJsonValue(value: unknown): JsonIssue[] {
  const issues: JsonIssue[] = [];
  walk(value, '', new Set(), issues);
  return issues;
}

function walk(value: unknown, path: string, ancestors: Set<object>, issues: JsonIssue[]): void {
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return;
    case 'number':
      if (!Number.isFinite(value)) issues.push({ path, message: `${value} is not valid JSON` });
      return;
    case 'undefined':
      issues.push({ path, message: 'undefined is not valid JSON' });
      return;
    case 'bigint':
      issues.push({ path, message: 'a BigInt is not valid JSON' });
      return;
    case 'function':
      issues.push({ path, message: 'a function is not valid JSON' });
      return;
    case 'symbol':
      issues.push({ path, message: 'a symbol is not valid JSON' });
      return;
  }

  if (value === null) return;
  const object = value as object;

  if (ancestors.has(object)) {
    issues.push({ path, message: 'a circular reference is not valid JSON' });
    return;
  }

  if (Array.isArray(object)) {
    ancestors.add(object);
    // Index loop, not forEach: a sparse array's holes are undefined and must be reported.
    for (let index = 0; index < object.length; index++) {
      walk(object[index], pointer(path, index), ancestors, issues);
    }
    ancestors.delete(object);
    return;
  }

  const prototype = Object.getPrototypeOf(object);
  if (prototype !== Object.prototype && prototype !== null) {
    const name = prototype?.constructor?.name || 'object';
    issues.push({ path, message: `a ${name} instance is not valid JSON` });
    return;
  }

  ancestors.add(object);
  for (const [key, child] of Object.entries(object)) {
    walk(child, pointer(path, key), ancestors, issues);
  }
  ancestors.delete(object);
}
