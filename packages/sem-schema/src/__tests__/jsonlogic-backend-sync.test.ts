/**
 * Keeps the jsonlogic validator in sync with the Semantius backend.
 *
 * src/jsonlogic/operators.ts is a hand-maintained copy of the operators that the
 * backend's evaluate_json_logic() implements, and of the $ variables that
 * build_record_logic_trigger() provides to rules. These tests read the backend's
 * migrations and fail when either drifts apart, and when a rule the backend ships
 * no longer passes the validator.
 *
 * The backend is read from a checkout of the semantius repository:
 *   - SEMANTIUS_BACKEND_DIR, when set
 *   - otherwise a sibling checkout next to this repository (../semantius)
 * Without a checkout the suite is skipped. Set SEMANTIUS_BACKEND_REQUIRED=1 to fail instead.
 */
import * as fs from 'fs';
import * as path from 'path';
import { JSONLOGIC_OPERATORS, RESERVED_VARIABLES } from '../jsonlogic/operators';
import { validateJsonLogic } from '../jsonlogic/validate';

// src/__tests__ -> src -> sem-schema -> packages -> repository root -> its parent
const backendDir = process.env.SEMANTIUS_BACKEND_DIR ?? path.resolve(__dirname, '../../../../../semantius');
const backendRequired = process.env.SEMANTIUS_BACKEND_REQUIRED === '1';
const appsDir = path.join(backendDir, 'apps');
const backendFound = fs.existsSync(path.join(appsDir, '_core', 'migrations'));

interface Migration {
  file: string;
  sql: string;
}

/** Migrations in apply order: the _core app first, then the other apps; files by name. */
function readMigrations(): Migration[] {
  const apps = fs
    .readdirSync(appsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(appsDir, entry.name, 'migrations')))
    .map((entry) => entry.name)
    .sort((a, b) => (a === '_core' ? -1 : b === '_core' ? 1 : a.localeCompare(b)));
  return apps.flatMap((app) => {
    const dir = path.join(appsDir, app, 'migrations');
    return fs
      .readdirSync(dir)
      .filter((name) => name.endsWith('.sql'))
      .sort()
      .map((name) => ({ file: `apps/${app}/migrations/${name}`, sql: fs.readFileSync(path.join(dir, name), 'utf8') }));
  });
}

/**
 * The body of the last applied definition of a function: from its CREATE up to the
 * closing `$$ LANGUAGE` (nested bodies in these functions use named dollar quotes).
 */
function lastFunctionBody(migrations: Migration[], definition: RegExp): { file: string; body: string } | undefined {
  let last: { file: string; body: string } | undefined;
  for (const { file, sql } of migrations) {
    const pattern = new RegExp(definition.source, 'gi');
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(sql))) {
      const rest = sql.slice(match.index);
      const end = rest.search(/\$\$\s*LANGUAGE/i);
      last = { file, body: end === -1 ? rest : rest.slice(0, end) };
    }
  }
  return last;
}

const unique = (values: string[]) => [...new Set(values)].sort();

/** The operators of the evaluate_json_logic definition that runs. */
function backendOperators(migrations: Migration[]): { file: string; operators: string[] } | undefined {
  const fn = lastFunctionBody(migrations, /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?evaluate_json_logic\s*\(\s*rule\s+jsonb/);
  if (!fn) return undefined;
  return { file: fn.file, operators: unique([...fn.body.matchAll(/\bop\s*=\s*'([^']+)'/g)].map((m) => m[1])) };
}

/** The $ variables build_record_logic_trigger puts into the data rules are evaluated against. */
function backendVariables(migrations: Migration[]): { file: string; variables: string[] } | undefined {
  const fn = lastFunctionBody(migrations, /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?build_record_logic_trigger\s*\(/);
  if (!fn) return undefined;
  return { file: fn.file, variables: unique([...fn.body.matchAll(/'(\$[A-Za-z_][A-Za-z0-9_]*)'/g)].map((m) => m[1])) };
}

/**
 * JsonLogic values written as SQL string literals in the migrations: arrays of
 * computed-field / validation-rule entries, and values containing an operation.
 */
function shippedRules(migrations: Migration[]): Array<{ file: string; rule: unknown }> {
  const known = new Set(Object.keys(JSONLOGIC_OPERATORS));
  const containsOperation = (value: unknown): boolean => {
    if (Array.isArray(value)) return value.some(containsOperation);
    if (value === null || typeof value !== 'object') return false;
    const keys = Object.keys(value);
    return (keys.length === 1 && known.has(keys[0])) || Object.values(value).some(containsOperation);
  };
  const isEntryArray = (value: unknown) =>
    Array.isArray(value) && value.some((entry) => entry !== null && typeof entry === 'object' && 'jsonlogic' in entry);

  const rules: Array<{ file: string; rule: unknown }> = [];
  for (const { file, sql } of migrations) {
    // Line comments may contain apostrophes that would throw the literal scan off.
    const code = sql.replace(/--[^\n]*/g, '');
    for (const match of code.matchAll(/'((?:[^']|'')*)'/g)) {
      const text = match[1].replace(/''/g, "'").trim();
      if (!text.startsWith('{') && !text.startsWith('[')) continue;
      let value: unknown;
      try {
        value = JSON.parse(text);
      } catch {
        continue;
      }
      if (isEntryArray(value) || containsOperation(value)) rules.push({ file, rule: value });
    }
  }
  return rules;
}

if (!backendFound && backendRequired) {
  describe('JsonLogic backend sync', () => {
    it('needs a semantius checkout', () => {
      throw new Error(`No semantius checkout at ${backendDir}. Set SEMANTIUS_BACKEND_DIR to the semantius repository.`);
    });
  });
} else if (!backendFound) {
  describe.skip(`JsonLogic backend sync (skipped: no semantius checkout at ${backendDir}; set SEMANTIUS_BACKEND_DIR)`, () => {
    it('compares the operator table with the backend', () => undefined);
  });
} else {
  describe('JsonLogic backend sync', () => {
    const migrations = readMigrations();
    const backend = backendOperators(migrations);
    const table = Object.keys(JSONLOGIC_OPERATORS).sort();

    it('finds the evaluate_json_logic definition in the backend migrations', () => {
      expect(backend?.operators.length).toBeGreaterThan(0);
    });

    it('knows every operator the backend implements (add missing ones to src/jsonlogic/operators.ts)', () => {
      const missing = (backend?.operators ?? []).filter((op) => !table.includes(op));
      expect({ definedIn: backend?.file, missing }).toEqual({ definedIn: backend?.file, missing: [] });
    });

    it('knows no operator the backend lacks (remove them from src/jsonlogic/operators.ts)', () => {
      const unknown = table.filter((op) => !(backend?.operators ?? []).includes(op));
      expect({ definedIn: backend?.file, unknown }).toEqual({ definedIn: backend?.file, unknown: [] });
    });

    it('knows exactly the $ variables build_record_logic_trigger provides (update RESERVED_VARIABLES in src/jsonlogic/operators.ts)', () => {
      const variables = backendVariables(migrations);
      expect(variables?.variables.length).toBeGreaterThan(0);
      const validator = unique([...RESERVED_VARIABLES]);
      const missing = (variables?.variables ?? []).filter((name) => !validator.includes(name));
      const unknown = validator.filter((name) => !(variables?.variables ?? []).includes(name));
      expect({ definedIn: variables?.file, missing, unknown }).toEqual({ definedIn: variables?.file, missing: [], unknown: [] });
    });

    it('accepts every JsonLogic rule shipped in the backend migrations', () => {
      const rules = shippedRules(migrations);
      expect(rules.length).toBeGreaterThan(0);
      const rejected = rules
        .map(({ file, rule }) => ({ file, rule, issues: validateJsonLogic(rule) }))
        .filter((result) => result.issues.length > 0);
      expect(rejected).toEqual([]);
    });
  });
}
