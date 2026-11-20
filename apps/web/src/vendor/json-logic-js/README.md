# json-logic-js, derived

Semantius evaluates JsonLogic rules in two places, with two implementations that
must answer every rule identically:

- **PL/pgSQL**, `evaluate_json_logic` in the semantius repository
  (`apps/_core/migrations/0050_jsonlogic.sql`), runs in the database on every
  write. It computes and stores `computed_fields` and enforces `validation_rules`
  and `select_rule`. It is the reference.
- **TypeScript**, `jsonLogic.ts` in this folder, runs in the browser. It evaluates
  `input_type_rule`, which only the browser evaluates, and previews
  `computed_fields` while the user types, with no round trip to the server.

Both are needed: the database has to enforce the rules whatever client writes,
and the form has to answer on every keystroke. A change to one is a change to the
other. It starts on the server, as a case in the shared test file both
implementations run (see "Changing it").

`jsonLogic.ts` in this folder is the browser's JsonLogic evaluator. It is derived
in part from [json-logic-js](https://github.com/jwadhams/json-logic-js) 2.0.5,
Copyright (c) 2015 Jeremy Wadhams, and is used under the MIT License in
[LICENSE](LICENSE). The repository's
[THIRD-PARTY-NOTICES.md](../../../../../THIRD-PARTY-NOTICES.md) lists it as well.

It is not a copy of that library. It is a TypeScript rewrite whose reference is
the Semantius backend's `evaluate_json_logic`, in `apps/_core/migrations/0050_jsonlogic.sql`
of the semantius repository. Where json-logic-js and the server disagree, the code
here gives the server's answer. This file records what was taken from the
library, what was changed and why, and what was added.

## Why the evaluator was copied instead of used

The app used to run json-logic-js 2.0.5 as a dependency. It was replaced for these reasons:

1. **The browser has to give the server's answers.** An `input_type_rule` runs
   only in the browser, so its answer decides whether a field is hidden, shown or
   required. The server runs no `required` check on a field that has an
   `input_type_rule` (`dd_required_test`, `0160_dd_functions.sql`), so a wrongly
   computed mode lets a record be saved without a value the rule meant to require.
   A computed field is previewed in the browser and recomputed by the server, so
   a different answer shows the user a wrong value while they type.
2. **json-logic-js follows JavaScript, and the server does not everywhere.** The
   library joins a list into text as `1,2`, reads `tags.length` and `"Bob".0`,
   compares lists by reference, counts `substr` positions in UTF-16 units and
   orders text by UTF-16 unit. The server does none of these.
3. **`let` and `set_record` cannot be added to the library correctly.** Both bind
   a name before their body is evaluated, so they must be dispatched like `if` and
   `map`. The library has no way to add such an operator: its operator table is
   private, and the only way to call an operator is `apply`, which evaluates the
   arguments again. The app therefore replaced every nested `let` or `set_record`
   with its value before handing the rule to the library. That evaluated it
   against the wrong data inside `map`, `filter` and `reduce`, ran it in `if`
   branches that were not taken, and let the library read a value that happened
   to be an object with one key as an operation.

Owning the evaluator removed all three problems. The app no longer depends on the
json-logic-js package.

## What is in this folder

| File                | Contents                                                                                                                                                                                      |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `jsonLogic.ts`      | The dispatch (`evaluate`), the operator table (`addOperation`), the server-shaped error (`serverError`), the helpers below, and the operators `var`, `missing`, `!`, `!!`, `merge` and `log`. |
| `jsonLogic.test.ts` | Tests of the helpers, against values measured on the server.                                                                                                                                  |
| `LICENSE`           | json-logic-js's license, as its author wrote it.                                                                                                                                              |

Every other operator is registered from outside the folder (see "Operators
registered outside this folder"). A rule is therefore evaluated through
`applyJsonLogic` in `src/lib/computedFields.ts`: importing that module is what
registers them. `evaluate` imported on its own does not know `==` or `+`.

## What was kept from json-logic-js

- **What an operation is:** an object with exactly one key, the operator. Any
  other value, an object with several keys included, is returned as it is.
- **The argument shape:** a single argument that is not a list is a list of one,
  so `{"var": "x"}` is `{"var": ["x"]}`.
- **Truthiness:** `false`, `null`, `0`, `""` and `[]` are false, everything else
  is true, including `{}`. This is also the server's `jl_truthy`.
- **`if` / `?:`:** pairs of condition and result, with an optional last argument
  as the else branch, and `null` when nothing matches.
- **`and` / `or`:** the first false (or true) value, else the last one.
- **`filter`, `map`, `all`, `none`, `some`:** the logic runs with each element as
  the data. `all` of an empty list is false, `none` true and `some` false.
- **`reduce`:** the logic runs with `{current, accumulator}` as the data.
- **The data as `this`:** an operator is called with the data the rule runs
  against as `this`.
- **`!`, `!!`, `merge` and `log`:** unchanged. Their answers are also the
  server's.

## What was changed

### The dispatch

- **Arguments are evaluated exactly once.** An evaluated argument is a value, and
  a value is never evaluated again. This is what keeps an object that a `var` or
  a `let` returns from being read as an operation.
- **`and` and `or` with no arguments answer `null`.** The library answered
  `undefined`, which JSON cannot hold. The server answers `null`.
- **A missing rule, or a missing argument a control operator evaluates, is
  `null`.** For example, the body of `{"let": ["x", 1]}` and the logic of
  `{"map": [[1, 2]]}`. The server's answers.
- **`reduce` starts from `null` unless it has a third argument.** The server
  counts the arguments; the library checked for `undefined`, which a rule parsed
  from JSON cannot contain, so the answers are the same.
- **An unknown operator raises the server's error:** SQLSTATE `90910`, message
  `Unrecognized operation: ${op}`, hint `{"op": …}`, after its arguments are
  evaluated, as on the server. The library threw a plain `Error`, which the form
  could not show as the server words it.
- **Dotted operator names are gone.** The library resolved `{"a.b": …}` as
  method `b` of an operation `a`. The server has no such form.

### `var`

The server's walk replaces the library's `data[key]`:

- a segment reads only an object's own keys;
- it indexes a list only when it is all digits, and finds nothing beyond the
  int range, because the server casts it to an int;
- text, a number or a boolean has no keys, so the default is returned.

So `tags.length`, `name.0` (the first character) and `x.constructor`, which the
library reached as JavaScript properties, find nothing. The path itself is read
as the server reads it (`jl_to_text`), so a number or a boolean names a key as
its text.

### `missing`

- The keys are the arguments, or the one argument when it is the **only** one and
  is a list. The library took the first argument as the key list whenever it was
  a list. The server's rule.
- Each key is read with the `var` walk above. The library evaluated `{"var": key}`
  again, which would have read a key that is an object with one key as an
  operation.

## What was added

### `let` and `set_record`

Two Semantius operators, dispatched before their arguments, as on the server:

- `{"let": [name, value, body]}` evaluates `value` and then `body`, with `name`
  bound to it.
- `{"set_record": [name, entity, id, body]}` evaluates `id`, looks the row up in
  the `RecordLookup` it is given, and evaluates `body` with `name` bound to the
  row, or to `null` when there is none. Fetching the row is the caller's job, so
  evaluation stays synchronous; `src/lib/computedFields.ts` notes the rows a rule
  asked for and fetches them.

How they bind, all as the server does it:

- **Into the data they are given.** When that data is not an object (inside a list
  operator it is the element, which can be a number, text, `null` or a list), the
  body runs against an object that holds only the bound name. So `{"var": ""}` in
  that body returns `{name: value}`. The server has done this since semantius
  `4834563`.
- **The name** is read as the server reads `vals ->> 0`: text is itself and
  anything else its jsonb text. A `null` name raises PostgreSQL's `22023`
  (`argument 1: key must not be null`), after the value is evaluated.
- **The id** of a `set_record` is looked up by the text the server hands
  `get_record_by_id` (`recordIdText`). `[5]` stays `"[5]"`, which matches no
  integer key; JavaScript's `String()` would have made it `"5"` and found row 5.

### Helpers for the server's text and order

| Helper         | What it reproduces                                                                                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `jsonbText`    | PostgreSQL's `jsonb::text`: a space after every comma and colon, object keys shorter first by their UTF-8 byte length, then bytewise, and numbers without an exponent. |
| `textOf`       | The server's `jl_to_text`: `null` and a missing value are empty, text is itself, anything else is its jsonb text.                                                      |
| `compareText`  | `COLLATE "C"`: text in code-point order. JavaScript's `<` compares UTF-16 units, which differ above U+FFFF.                                                            |
| `recordIdText` | The id text a `set_record` hands the server, as above.                                                                                                                 |
| `missingKeys`  | `missing`'s key reading, for `missing_some`.                                                                                                                           |

## Operators registered outside this folder

These replace or extend json-logic-js's operators. They live with the number,
date and equality logic they need, and register themselves on this evaluator.

| Operator                              | Where                       | Instead of json-logic-js 2.0.5                                                                                                                                                                                                                                                           |
| ------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `==`, `!=`                            | `src/lib/computedFields.ts` | The server's `jl_loose_eq`: lists and objects by value, an ISO date equal to its epoch seconds, text that carries no number equal to no number, a list against a number or text as its joined text.                                                                                      |
| `===`, `!==`                          | same                        | The same JSON type and value, lists and objects by value.                                                                                                                                                                                                                                |
| `<`, `<=`, `>`, `>=`                  | same                        | Two texts in code-point order. Anything else as numbers: text through `Number()` or as an ISO date's epoch seconds, and `null`, a list or an object as 0. Text that carries no number makes the comparison false. `<` and `<=` take a third argument as a range; `>` and `>=` ignore it. |
| `+`, `-`, `*`, `/`, `%`, `min`, `max` | same                        | `null`, a missing value, a list or an object count as 0. Text that carries no number, and any result that is not a finite number, raise `90920`. A result computed from date text is rounded to the microsecond.                                                                         |
| `cat`                                 | same                        | Every argument as `textOf` makes it, so `[1, 2]` is `"[1, 2]"`, not `"1,2"`.                                                                                                                                                                                                             |
| `substr`                              | same                        | The text of anything (`textOf`). Start and length are rounded half away from zero, and beyond the int range raise `22003`. Positions count characters, not UTF-16 units.                                                                                                                 |
| `in`                                  | same                        | In a list, the needle is compared by value, so a list or an object can be found. In text, the needle is searched for as text: `null` as `"null"`, anything else as `textOf` makes it.                                                                                                    |
| `missing_some`                        | same                        | The count is read as a number the server's way. Keys that are not a list raise `22023`.                                                                                                                                                                                                  |

Operators that json-logic-js does not have at all:

| Operator                                                                                     | Where                                                                                                   |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `concat`, `has_permission`, `is_match`, `value_changed`, `require_permission`, `throw_error` | `src/lib/computedFields.ts`                                                                             |
| `is_raci_actor`, `has_consultation`                                                          | `src/lib/computedFields.ts`. They read the database, so in the browser they raise that they cannot run. |
| `date_add`, `date_diff`, `date_part`, `date_trunc`, `to_date`, `date_format`                 | `src/lib/jsonLogicDates.ts`                                                                             |

## What json-logic-js had that is gone

- Dotted operator names (see "The dispatch").
- The helpers `uses_data`, `rm_operation` and `rule_like`. Nothing in the app used
  them.
- The JavaScript behavior of `==`, `!=`, `===`, `!==`, the ordering and
  arithmetic operators, `in`, `cat`, `substr` and `var` described above.

## Where the browser still differs from the server

These are known and accepted:

- **Number precision.** The browser computes in IEEE doubles, the server in exact
  `numeric`, so `0.1 + 0.2` is `0.30000000000000004` against `0.3`. The server's
  value is the one stored.
- **Numbers written in the rule.** JSON parsing drops what a double cannot keep,
  so `10.50` is `10.5`, `1.0` is `1` (for example as a `let` name) and `1e-400`
  is `0`. The server keeps them as written.
- **An empty `set_record` id.** The browser binds `null`; the server refuses the id
  (`90238`) when the record is saved.
- **`is_match`** uses JavaScript's regular expressions, the server PostgreSQL's.
  `\b` is a word boundary in the browser and a backspace on the server.
- **`$now`** is the browser's clock in milliseconds (`src/lib/ruleContext.ts`),
  the server's transaction time in microseconds.
- **`is_raci_actor` and `has_consultation`** cannot run in the browser (see above).

## How it is held to the server

- The backend's own test cases, `apps/test/tests/0100_test_jsonlogic.json` in the
  semantius repository, are copied to `vendor/semantius/0100_test_jsonlogic.json`
  at the repository root by `node scripts/vendor-semantius.mjs`.
  `src/lib/computedFields.test.ts` runs every one of them through the browser
  evaluator, and each must give the server's answer.
- The same file checks that the copy matches the backend's `origin/main` wherever
  a semantius clone exists, so a change on the server shows up here as a failing
  test.
- `jsonLogic.test.ts` tests the helpers, and `computedFields.test.ts` the refusals
  and the `let` and `set_record` binding, against answers measured on the server.

## Changing it

The server is the reference, so a change starts there. Add the case to the
backend's `0100_test_jsonlogic.json` with the server's answer, regenerate its SQL
(`deno task testgen_jsonlogic`) and push it. Then run
`node scripts/vendor-semantius.mjs` here and change this code until every case
passes. A behavior the corpus cannot express, such as an error, gets a test in
`computedFields.test.ts` with the server's answer, measured with
`select evaluate_json_logic(...)` on a local backend.
