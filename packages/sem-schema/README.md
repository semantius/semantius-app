# SemSchema

Custom JSON Schema vocabulary (SemSchema) with additional validation features for use with AJV.

## Features

### Custom Formats
- **`json`**: Validates JSON text (must parse) and parsed JSON values (must be real JSON at any depth — no `undefined`, `NaN`, `Infinity`, functions, `BigInt`, class instances or circular references)
- **`html`**: Validates HTML markup (requires HTML tags)
- **`text`**: Single-line text string (UI hint — renders as a text input)
- **`multiline`**: Multi-line text string (UI hint — renders as a textarea)
- **`jsonlogic`**: A JsonLogic rule stored as JSON, validated statically against the Semantius backend's operators (see [JsonLogic](#jsonlogic))

### Standard Formats
SemSchema also supports all standard JSON Schema formats via `ajv-formats`:
- **Date/Time**: `date`, `time`, `date-time`, `duration`
- **Network**: `email`, `hostname`, `ipv4`, `ipv6`, `uri`, `uri-reference`, `url`
- **Other**: `uuid`, `regex`, `json-pointer`, and more

### Format Validation
- **Unknown formats are rejected**: Using an unrecognized format (e.g., `emailx` instead of `email`) will throw an error during schema validation
- This prevents typos and ensures all formats are properly validated

### Custom Keywords

#### ⚠️ CRITICAL: `inputMode` Keyword for Required Fields

SemSchema uses the **`inputMode: "required"`** keyword that serves BOTH UI and validation purposes:

- **UI Purpose**: Displays red asterisk (*) next to field label in forms
- **Validation Purpose**: Validates MEANINGFUL values (not just existence)
  - `null` → FAILS validation
  - `undefined` → FAILS validation  
  - `""` (empty string) → FAILS validation
  - **Applies to ALL string types** (json, html, text, date, email, enum, or any format)

**Valid `inputMode` values**:
- `"default"` - Normal field (no special UI or validation)
- `"required"` - Shows asterisk AND validates non-empty values
- `"readonly"` - Field is read-only
- `"disabled"` - Field is disabled
- `"hidden"` - Field is hidden from UI

**Example**:
```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "inputMode": "required"    // ← Shows asterisk + validates non-empty
    },
    "email": {
      "type": "string",
      "format": "email",
      "inputMode": "required"    // ← Also validates empty string
    },
    "notes": {
      "type": "string",
      "inputMode": "readonly"    // ← Read-only field
    }
  }
}
```

**Important for Form Validation**: The `inputMode: "required"` keyword is checked during data validation in the `validateData` function, and form components use it to display asterisks and determine field behavior.

#### `precision` Keyword
- **`precision`**: Integer (0-4) limiting decimal places in numbers
  - Example: `precision: 2` allows 99.99 but rejects 99.999

### Type Inference
- When `format` is provided without `type`, the type is the format's `jsonType` in [src/vocabulary.json](src/vocabulary.json) — the type the Semantius backend maps the format to
- E.g. `html`, `date`, `enum` → `string`; `int32`, `reference` → `integer`; `double` → `number`; `object` → `object`; `json` and `jsonlogic` → every JSON type (`object`, `array`, `string`, `number`, `integer`, `boolean`, `null`)
- Allows schemas like `{ "format": "json" }` or `{ "format": "int32" }` without explicit type declaration

### JSON values and AJV

AJV only passes strings to format validators; objects, arrays and other non-string values skip them. `json` and `jsonlogic` values are usually objects, so for these two formats `preprocessSchema` attaches an internal keyword that validates the value whatever its type. Schema authors only write the format. Errors are reported as `format` errors (`params.format` is the format name, `params.path` the JSON pointer inside the value), with a message that says what is wrong and where, e.g. `NaN is not valid JSON at /a/1` or `must be valid JSON: <parser message>`.

### JsonLogic

`format: "jsonlogic"` validates [JsonLogic](https://jsonlogic.com/) rules without running them. The operator set is the one the Semantius backend implements in `evaluate_json_logic()`: the 35 standard operators plus the Semantius extensions `let`, `set_record`, `has_permission`, `require_permission`, `value_changed`, `concat`, `is_match`, `throw_error`, `is_raci_actor` and `has_consultation`.

**Accepted values**
- A rule, stored as JSON: `{ "==": [{ "var": "status" }, "open"] }`
- JSON text of a rule, as an editor hands it back: `'{"==": [{"var": "status"}, "open"]}'`
- Computed-field entries: `[{ "name": "total", "jsonlogic": <rule> }]`
- Validation-rule entries: `[{ "code": "99001", "message": "...", "jsonlogic": <rule> }]`
- `{}`, `""` and a missing value mean "no rule"

**What is rejected**
- Everything the `json` format rejects (invalid JSON text, values that are not real JSON)
- Unknown operators, with a suggestion for close matches (`"="` → did you mean `"=="`?)
- Objects with more than one key: they are not operations but literal values that are always truthy
- Wrong argument counts, including legal-but-misleading ones (`>=` with a third argument, which the backend ignores)
- Invalid literal arguments: `var` paths, `let`/`set_record` names (must be literal strings), permission names, `throw_error` codes and parameters, RACI letters
- Unknown `$` variables (the backend provides `$today`, `$now`, `$user_id`, `$old`, `$mode`; names bound by `let`/`set_record` are allowed)
- Inside the logic of `map`, `filter`, `all`, `none`, `some` and `reduce`, which the backend evaluates against each array item (`{current, accumulator}` for `reduce`): any `$` variable, and names bound by a `let`/`set_record` outside the operator. Item fields and names bound inside the logic are allowed
- Entries without `name` (computed fields) or `code`/`message` (validation rules), and codes outside class 99 (class 90 for `source_module: "platform"`)

**Errors** are reported as `format` errors with `params.format: "jsonlogic"` (see [JSON values and AJV](#json-values-and-ajv)), e.g. `unknown operator "vra" (did you mean "var"?) at /0/jsonlogic/+/1`.

**Keeping in sync with the backend**: the operator table and the `$` variable list in [src/jsonlogic/operators.ts](src/jsonlogic/operators.ts) are maintained by hand. `src/__tests__/jsonlogic-backend-sync.test.ts` reads the backend's migrations and fails when the operators differ from `evaluate_json_logic()`, when the `$` variables differ from those in `build_record_logic_trigger()`, or when a rule shipped in the migrations no longer validates. It looks for the semantius repository in `SEMANTIUS_BACKEND_DIR`, or next to this repository (`../semantius`). Without a checkout the suite is skipped; set `SEMANTIUS_BACKEND_REQUIRED=1` to make that a failure.

## Installation

```bash
pnpm add sem-schema
```

## Usage

### Basic Usage

```typescript
import { validateSchema, validateData } from 'sem-schema';

// Define schema
const schema = {
  type: 'object',
  properties: {
    email: { 
      type: 'string',
      format: 'email',
      inputMode: 'required'  // Shows asterisk + validates non-empty
    },
    config: { 
      format: 'json'  // Type inferred: any JSON value, or JSON text
    },
    price: { 
      type: 'number', 
      precision: 2  // Up to 2 decimal places
    }
  }
};

// Validate the schema itself
validateSchema(schema); // Returns true or throws error

// Validate data against the schema
const result = validateData({ 
  email: 'user@example.com', 
  config: '{"key":"value"}', 
  price: 99.99 
}, schema);

console.log(result.valid); // true
console.log(result.errors); // null

// Invalid data
const invalid = validateData({ 
  email: '', 
  config: '{invalid}', 
  price: 99.999 
}, schema);

console.log(invalid.valid); // false
console.log(invalid.errors); // Array of error objects
```

## API

### `validateSchema(schemaJson)`

Validates that a JSON Schema is valid according to SemSchema vocabulary.

**Parameters**:
- `schemaJson`: SchemaObject - The JSON Schema to validate

**Returns**: `true` if valid

**Throws**: Error if schema is invalid

### `validateData(data, schemaJson)`

Validates data against a JSON Schema using SemSchema vocabulary.

**Parameters**:
- `data`: any - The data to validate
- `schemaJson`: SchemaObject - The JSON Schema to validate against

**Returns**: Object with:
- `valid`: boolean - true if data is valid, false otherwise
- `errors`: array | null - Array of validation error objects if invalid, null if valid

## Project Structure

```
sem-schema/
├── src/
│   ├── formats/           # Custom format validators (internal)
│   ├── keywords/          # Custom keyword validators (internal)
│   ├── json/              # JSON value validation shared by json and jsonlogic (internal)
│   ├── jsonlogic/         # JsonLogic operator table and static validator (internal)
│   ├── __tests__/
│   │   ├── vocabulary.test.ts      # Vocabulary definition tests
│   │   ├── data-validation.test.ts # Data validation tests
│   │   └── jsonlogic-backend-sync.test.ts # JsonLogic operators vs. the semantius backend
│   ├── api.ts             # Public API
│   ├── validator.ts       # Validator creation (internal)
│   ├── utils.ts           # Utilities (internal)
│   ├── vocabulary.json    # Vocabulary definition (internal)
│   └── index.ts           # Main exports
└── dist/                  # Compiled output
```

## Testing

```bash
pnpm test          # Run all tests
pnpm test:watch    # Run tests in watch mode
```

The test suite includes:
- **Vocabulary Definition Tests**: Verify schemas with custom keywords can be compiled
- **Data Validation Tests**: Verify data correctly validates against schemas
- **JsonLogic Backend Sync Tests**: Verify the JsonLogic operators and `$` variables match the semantius backend (skipped without a semantius checkout, see [JsonLogic](#jsonlogic))

## Extending SemSchema

SemSchema is designed to be extensible. You can add custom formats and keywords to suit your needs.

### Supported Formats

The formats are defined once, in `properties.format.oneOf` of [src/vocabulary.json](src/vocabulary.json): one entry per format with its name (`const`), the JSON type it implies when a schema has no `type` (`jsonType`) and a description. Schema validation, type inference and the meta-schema all read that list; do not list formats anywhere else. It must match the formats the Semantius backend accepts (`valid_format` and `format_to_json_type`).

For the GUI and the backend, the same list is written to [formats.json](formats.json) (`{ "<format>": { "type", "description" } }`, importable as `sem-schema/formats.json`). It is generated: never edit it by hand, run `pnpm generate:formats` after changing formats in `vocabulary.json`. A test fails when `formats.json` is out of date.

The JSON type names `string`, `number`, `integer`, `boolean`, `object` and `array` are formats too; when a schema also gives `type`, it must be compatible with the format. `null` is not a format: a field that can only hold `null` holds no data.

`email`, `hostname`, `uri` and `uri-reference` are not restricted to ASCII: each accepts Unicode and validates exactly like `idn-email`, `idn-hostname`, `iri` and `iri-reference` (e.g. `jörg@müller.de`, `müller.de`, `https://müller.de/straße`). Values are mapped to their ASCII wire form (punycode, percent-encoding) and then checked with the strict ajv-formats validators ([src/formats/internationalized.ts](src/formats/internationalized.ts)).

### Adding a Custom Format

Follow these steps to add a new custom format (e.g., `phone`):

#### Step 1: Add to vocabulary.json

Add an entry to `properties.format.oneOf` in `src/vocabulary.json`:

```json
{ "const": "phone", "jsonType": "string", "description": "Phone number, E.164 (+12025551234)" }
```

Then regenerate `formats.json`: `pnpm generate:formats`

#### Step 2: Create format validator

Create `src/formats/phone.ts`:

```typescript
import type { Format } from 'ajv';

/**
 * Validates phone number in E.164 format
 */
export const phoneFormat: Format = {
  validate: (data: string): boolean => {
    // E.164 format: +[country code][number]
    return /^\+?[1-9]\d{1,14}$/.test(data);
  }
};
```

#### Step 3: Export from formats/index.ts

```typescript
export { jsonFormat } from './json';
export { htmlFormat } from './html';
export { textFormat } from './text';
export { phoneFormat } from './phone'; // ← Add export
```

#### Step 4: Register in validator.ts

Edit `src/validator.ts` and register your format:

```typescript
import { jsonFormat, htmlFormat, textFormat, phoneFormat } from './formats';

export function createSemSchemaValidator(): Ajv {
  // ... existing setup code
  
  // Add custom formats
  ajv.addFormat('json', jsonFormat);
  ajv.addFormat('html', htmlFormat);
  ajv.addFormat('text', textFormat);
  ajv.addFormat('phone', phoneFormat); // ← Add format
  
  // ...
}
```

#### Step 5: Add schema validation test

Add to `src/__tests__/vocabulary.test.ts`:

```typescript
describe('Schema Validity - Standard formats', () => {
  // ... existing tests
  
  it('should accept schema with format: phone', () => {
    const schema = { type: 'string', format: 'phone' };
    const result = validateSchema(schema);
    expect(result.valid).toBe(true);
    expect(result.errors).toBeNull();
  });
});
```

#### Step 6: Add data validation tests

Add to `src/__tests__/data-validation.test.ts`:

```typescript
describe('Format Validation - phone', () => {
  it('should validate phone format with valid E.164 number', () => {
    const schema = { type: 'string', format: 'phone' };
    const result = validateData('+12025551234', schema);
    expect(result.valid).toBe(true);
  });

  it('should reject invalid phone number', () => {
    const schema = { type: 'string', format: 'phone' };
    const result = validateData('not-a-phone', schema);
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
  });
});
```

**That's it!** Your format will now:
- ✅ Be recognized as valid in schemas
- ✅ Validate data correctly
- ✅ Reject unknown formats and catch typos
- ✅ Be fully tested

### Adding a Custom Keyword

To add a new custom keyword (e.g., `maxWords`):

#### Step 1: Create keyword file

Create `src/keywords/maxWords.ts`:

```typescript
import type Ajv from 'ajv';
import type { KeywordDefinition } from 'ajv';

/**
 * Custom keyword that limits the number of words in a string
 */
export const maxWordsKeyword: KeywordDefinition = {
  keyword: 'maxWords',
  type: 'string',
  schemaType: 'number',
  compile(max: number) {
    return function validate(data: string): boolean {
      const wordCount = data.trim().split(/\s+/).length;
      if (wordCount > max) {
        validate.errors = [{
          keyword: 'maxWords',
          message: `must have at most ${max} words`,
          params: { max, actual: wordCount }
        }];
        return false;
      }
      return true;
    };
  },
  errors: true
};
```

#### Step 2: Export from keywords/index.ts

```typescript
export { precisionKeyword } from './precision';
export { maxWordsKeyword } from './maxWords'; // ← Add export
```

#### Step 3: Register in validator.ts

```typescript
import { precisionKeyword, maxWordsKeyword } from './keywords';

export function createSemSchemaValidator(): Ajv {
  // ... existing setup
  
  ajv.addKeyword(precisionKeyword);
  ajv.addKeyword(maxWordsKeyword); // ← Add keyword
  
  // ...
}
```

#### Step 4: Add validation in utils.ts (optional)

If you need schema-level validation for your keyword's value:

```typescript
export function validateSchemaStructure(schema: SchemaObject, path: string = '#'): SchemaValidationError[] {
  // ... existing validations
  
  // Validate maxWords keyword
  if (schema.maxWords !== undefined) {
    if (typeof schema.maxWords !== 'number') {
      errors.push({
        schemaPath: path,
        message: 'maxWords must be a number',
        keyword: 'maxWords',
        value: schema.maxWords
      });
    } else if (schema.maxWords < 1 || !Number.isInteger(schema.maxWords)) {
      errors.push({
        schemaPath: path,
        message: 'maxWords must be a positive integer',
        keyword: 'maxWords',
        value: schema.maxWords
      });
    }
  }
  
  return errors;
}
```

#### Step 5: Add tests

Add both schema and data validation tests as shown in the format example.

### Testing Your Extensions

Always add comprehensive tests:

- **Schema validation tests** (`vocabulary.test.ts`): Verify schemas with your extension are accepted/rejected correctly
- **Data validation tests** (`data-validation.test.ts`): Verify data validates correctly against your extension
- Test both valid and invalid cases
- Test edge cases and error messages

## Vocabulary Definition

The vocabulary includes:
- Custom formats: `json`, `html`, `text`, `multiline`, `code`, `jsonata`, `jsonlogic`, `reference`, `parent`
- Standard formats: All formats from `ajv-formats` (email, date, uri, uuid, etc.)
- Custom keywords: `required` (property-level), `precision`

## License

ISC
