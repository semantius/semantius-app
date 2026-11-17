/**
 * Keeps the jsonlogic validator in sync with the Semantius backend.
 *
 * src/jsonlogic/operators.ts is a hand-maintained copy of the operators that the
 * backend's evaluate_json_logic() implements, and of the $ variables that
 * build_record_logic_trigger() provides to rules. These tests fail when either
 * drifts apart, and when a rule the backend ships no longer passes the validator.
 *
 * What they compare against is a SNAPSHOT of the backend's migrations,
 * committed at vendor/semantius/jsonlogic-backend.json, so they run in CI and
 * before a release, where there is no backend checkout. Where there is one, a
 * further test fails when the snapshot no longer matches it. Refresh the
 * snapshot (and the backend's JsonLogic test cases beside it) with
 *
 *     node scripts/vendor-semantius.mjs
 *
 * which runs this file with SEMANTIUS_VENDOR_WRITE=1: the extraction below is
 * the only one, and that run writes what it extracts instead of comparing.
 *
 * The backend is read from a checkout of the semantius repository:
 *   - SEMANTIUS_BACKEND_DIR, when set
 *   - otherwise a sibling checkout next to this repository (../semantius)
 * Without a checkout the snapshot comparison is skipped. Set
 * SEMANTIUS_BACKEND_REQUIRED=1 to fail instead.
 */
import * as fs from 'fs';
import * as path from 'path';
import { DATE_FORMAT_TOKENS, DATE_PARTS, DATE_UNITS, JSONLOGIC_OPERATORS, RESERVED_VARIABLES } from '../jsonlogic/operators';
import { validateJsonLogic } from '../jsonlogic/validate';

// src/__tests__ -> src -> sem-schema -> packages -> repository root -> its parent
const backendDir = process.env.SEMANTIUS_BACKEND_DIR ?? path.resolve(__dirname, '../../../../../semantius');
const backendRequired = process.env.SEMANTIUS_BACKEND_REQUIRED === '1';
const vendorWrite = process.env.SEMANTIUS_VENDOR_WRITE === '1';
const appsDir = path.join(backendDir, 'apps');
const backendFound = fs.existsSync(path.join(appsDir, '_core', 'migrations'));
// src/__tests__ -> src -> sem-schema -> packages -> repository root
const snapshotPath = path.resolve(__dirname, '../../../../vendor/semantius/jsonlogic-backend.json');

interface Migration {
  file: string;
  sql: string;
}

/** What the tests below need from the backend, and where each part is defined. */
interface BackendSnapshot {
  operators: { file: string; names: string[] };
  variables: { file: string; names: string[] };
  dateUnits: string[];
  dateParts: string[];
  dateFormatTokens: string[];
  rules: Array<{ file: string; rule: unknown }>;
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
function backendOperators(migrations: Migration[]): { file: string; names: string[] } | undefined {
  const fn = lastFunctionBody(migrations, /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?evaluate_json_logic\s*\(\s*rule\s+jsonb/);
  if (!fn) return undefined;
  return { file: fn.file, names: unique([...fn.body.matchAll(/\bop\s*=\s*'([^']+)'/g)].map((m) => m[1])) };
}

/** The $ variables build_record_logic_trigger puts into the data rules are evaluated against. */
function backendVariables(migrations: Migration[]): { file: string; names: string[] } | undefined {
  const fn = lastFunctionBody(migrations, /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?build_record_logic_trigger\s*\(/);
  if (!fn) return undefined;
  return { file: fn.file, names: unique([...fn.body.matchAll(/'(\$[A-Za-z_][A-Za-z0-9_]*)'/g)].map((m) => m[1])) };
}

/** A `CONSTANT text[]` declared inside a backend function. */
function backendList(migrations: Migration[], functionName: string, constant: string): string[] {
  const fn = lastFunctionBody(migrations, new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+(?:public\\.)?${functionName}\\s*\\(`));
  const list = fn?.body.match(new RegExp(`${constant}\\s+CONSTANT\\s+text\\[\\]\\s*:=\\s*ARRAY\\[([^\\]]*)\\]`, 'i'));
  return list ? [...list[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : [];
}

/**
 * JsonLogic values written as SQL string literals in the migrations: arrays of
 * computed-field / validation-rule entries, and values containing an operation
 * — an operator the backend's own evaluator implements, so the snapshot
 * depends on the backend alone.
 */
function shippedRules(migrations: Migration[], operators: string[]): Array<{ file: string; rule: unknown }> {
  const known = new Set(operators);
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

/** Everything the tests compare against, read from the backend's migrations. */
function snapshotOf(migrations: Migration[]): BackendSnapshot {
  const operators = backendOperators(migrations) ?? { file: '', names: [] };
  return {
    operators,
    variables: backendVariables(migrations) ?? { file: '', names: [] },
    dateUnits: backendList(migrations, 'jl_date_unit', 'v_units'),
    dateParts: backendList(migrations, 'jl_date_part', 'v_parts'),
    dateFormatTokens: backendList(migrations, 'jl_date_format', 'v_tokens'),
    rules: shippedRules(migrations, operators.names),
  };
}

// Before anything reads the snapshot: the describe blocks below read it while
// the tests are collected, and on the first refresh it does not exist yet.
if (vendorWrite && backendFound) {
  fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
  fs.writeFileSync(snapshotPath, `${JSON.stringify(snapshotOf(readMigrations()), null, 2)}\n`);
}

describe('the vendored backend snapshot', () => {
  if (!backendFound) {
    const test = backendRequired ? it : it.skip;
    test(`matches the backend checkout (none at ${backendDir}; set SEMANTIUS_BACKEND_DIR)`, () => {
      throw new Error(`No semantius checkout at ${backendDir}. Set SEMANTIUS_BACKEND_DIR to the semantius repository.`);
    });
    return;
  }

  it('matches the backend checkout (refresh it with: node scripts/vendor-semantius.mjs)', () => {
    const vendored = JSON.parse(fs.readFileSync(snapshotPath, 'utf8')) as BackendSnapshot;
    expect(vendored).toEqual(snapshotOf(readMigrations()));
  });
});

describe('JsonLogic backend sync', () => {
  const backend = JSON.parse(fs.readFileSync(snapshotPath, 'utf8')) as BackendSnapshot;
  const table = Object.keys(JSONLOGIC_OPERATORS).sort();

  it('finds the evaluate_json_logic definition in the backend migrations', () => {
    expect(backend.operators.names.length).toBeGreaterThan(0);
  });

  it('knows every operator the backend implements (add missing ones to src/jsonlogic/operators.ts)', () => {
    const missing = backend.operators.names.filter((op) => !table.includes(op));
    expect({ definedIn: backend.operators.file, missing }).toEqual({ definedIn: backend.operators.file, missing: [] });
  });

  it('knows no operator the backend lacks (remove them from src/jsonlogic/operators.ts)', () => {
    const unknown = table.filter((op) => !backend.operators.names.includes(op));
    expect({ definedIn: backend.operators.file, unknown }).toEqual({ definedIn: backend.operators.file, unknown: [] });
  });

  it('knows exactly the $ variables build_record_logic_trigger provides (update RESERVED_VARIABLES in src/jsonlogic/operators.ts)', () => {
    expect(backend.variables.names.length).toBeGreaterThan(0);
    const validator = unique([...RESERVED_VARIABLES]);
    const missing = backend.variables.names.filter((name) => !validator.includes(name));
    const unknown = validator.filter((name) => !backend.variables.names.includes(name));
    expect({ definedIn: backend.variables.file, missing, unknown }).toEqual({ definedIn: backend.variables.file, missing: [], unknown: [] });
  });

  it.each([
    ['units', backend.dateUnits, DATE_UNITS],
    ['parts', backend.dateParts, DATE_PARTS],
    ['format tokens', backend.dateFormatTokens, DATE_FORMAT_TOKENS],
  ])('lists the same date %s as the backend (update src/jsonlogic/operators.ts)', (_label, fromBackend, list) => {
    expect(fromBackend).toEqual([...list]);
  });

  it('accepts every JsonLogic rule shipped in the backend migrations', () => {
    expect(backend.rules.length).toBeGreaterThan(0);
    const rejected = backend.rules
      .map(({ file, rule }) => ({ file, rule, issues: validateJsonLogic(rule) }))
      .filter((result) => result.issues.length > 0);
    expect(rejected).toEqual([]);
  });
});
