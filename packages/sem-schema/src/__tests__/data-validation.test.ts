/**
 * Tests for data validation using SemSchema vocabulary
 * These tests verify that data correctly validates against schemas using custom keywords
 */
import { validateData } from '../api';

describe('Data Validation Tests', () => {
  describe('Format: json', () => {
    it('should validate valid JSON string', () => {
      const schema = { type: 'string', format: 'json' };
      
      expect(validateData('{"key": "value"}', schema).valid).toBe(true);
      expect(validateData('[]', schema).valid).toBe(true);
      expect(validateData('["x","y"]', schema).valid).toBe(true);
      expect(validateData('[1,2,3]', schema).valid).toBe(true);
      expect(validateData('123', schema).valid).toBe(true);
      expect(validateData('"string"', schema).valid).toBe(true);
    });

    it('should reject invalid JSON string', () => {
      const schema = { type: 'string', format: 'json' };

      expect(validateData('{invalid json}', schema).valid).toBe(false);
      expect(validateData('{"incomplete":', schema).valid).toBe(false);
    });

    // get_schema emits json properties with every JSON type
    const JSON_TYPES = ['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'];
    const jsonSchema = { type: JSON_TYPES, format: 'json' };
    const messages = (data: unknown, schema: object = jsonSchema) =>
      (validateData(data, schema).errors ?? []).map((e: any) => e.message);

    it('should accept parsed JSON values', () => {
      expect(validateData({ key: 'value', list: [1, true, null] }, jsonSchema).valid).toBe(true);
      expect(validateData([], jsonSchema).valid).toBe(true);
      expect(validateData(42, jsonSchema).valid).toBe(true);
      expect(validateData(false, jsonSchema).valid).toBe(true);
      expect(validateData(null, jsonSchema).valid).toBe(true);
    });

    it('should accept the same object referenced twice (not circular)', () => {
      const shared = { a: 1 };
      expect(validateData({ first: shared, second: shared }, jsonSchema).valid).toBe(true);
    });

    it('should explain why JSON text does not parse', () => {
      const [message] = messages('{"incomplete":');
      expect(message).toMatch(/^must be valid JSON: .+/);
    });

    it('should reject values that are not JSON, naming where they are', () => {
      expect(messages({ a: [1, NaN] })).toEqual(['NaN is not valid JSON at /a/1']);
      expect(messages({ a: Infinity })).toEqual(['Infinity is not valid JSON at /a']);
      expect(messages({ a: undefined })).toEqual(['undefined is not valid JSON at /a']);
      expect(messages({ a: () => 1 })).toEqual(['a function is not valid JSON at /a']);
      expect(messages({ a: BigInt(1) })).toEqual(['a BigInt is not valid JSON at /a']);
      expect(messages({ a: new Date(0) })).toEqual(['a Date instance is not valid JSON at /a']);
      expect(messages([new Map()])).toEqual(['a Map instance is not valid JSON at /0']);
      expect(messages([1, , 3])).toEqual(['undefined is not valid JSON at /1']);
    });

    it('should reject circular references', () => {
      const node: any = { name: 'node' };
      node.self = node;
      expect(messages(node)).toEqual(['a circular reference is not valid JSON at /self']);
    });

    it('should report errors as format errors on the property', () => {
      const schema = { type: 'object', properties: { config: jsonSchema } };
      const result = validateData({ config: { a: NaN } }, schema);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors?.[0]).toMatchObject({
        keyword: 'format',
        instancePath: '/config',
        params: { format: 'json', path: '/a' },
        message: 'NaN is not valid JSON at /a'
      });
    });
  });

  describe('Format: html', () => {
    it('should validate HTML string', () => {
      const schema = { type: 'string', format: 'html' };
      
      expect(validateData('<p>Hello</p>', schema).valid).toBe(true);
      expect(validateData('<div>World</div>', schema).valid).toBe(true);
      expect(validateData('<a href="#">Link</a>', schema).valid).toBe(true);
    });

    it('should reject non-HTML string', () => {
      const schema = { type: 'string', format: 'html' };
      
      expect(validateData('Just plain text', schema).valid).toBe(false);
      expect(validateData('No tags here', schema).valid).toBe(false);
    });
  });

  describe('Format: text', () => {
    it('should validate single-line text strings', () => {
      const schema = { type: 'string', format: 'text' };

      expect(validateData('Single line', schema).valid).toBe(true);
      expect(validateData('', schema).valid).toBe(true);
    });
  });

  describe('Format: multiline', () => {
    it('should validate strings including multiline content', () => {
      const schema = { type: 'string', format: 'multiline' };

      expect(validateData('Single line', schema).valid).toBe(true);
      expect(validateData('Multi\nline\ntext', schema).valid).toBe(true);
      expect(validateData('', schema).valid).toBe(true);
    });
  });

  describe('Format: code', () => {
    it('should validate code strings', () => {
      const schema = { type: 'string', format: 'code' };
      
      expect(validateData('const x = 1;', schema).valid).toBe(true);
      expect(validateData('function test() { return true; }', schema).valid).toBe(true);
      expect(validateData('Multi\nline\ncode', schema).valid).toBe(true);
      expect(validateData('', schema).valid).toBe(true);
    });
  });

  describe('Format: jsonata', () => {
    it('should validate jsonata strings', () => {
      const schema = { type: 'string', format: 'jsonata' };
      
      expect(validateData('$.fieldName', schema).valid).toBe(true);
      expect(validateData('$sum(items.price)', schema).valid).toBe(true);
      expect(validateData('items[price > 10]', schema).valid).toBe(true);
      expect(validateData('', schema).valid).toBe(true);
    });
  });

  describe('Format: jsonlogic', () => {
    // get_schema emits jsonlogic properties with the same union type as json
    const JSON_TYPES = ['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'];
    const ruleSchema = { type: JSON_TYPES, format: 'jsonlogic' };
    const formSchema = (inputMode = 'default') => ({
      type: 'object',
      properties: { rule: { type: JSON_TYPES, format: 'jsonlogic', default: {}, inputMode } }
    });
    const messages = (data: unknown, schema: object = ruleSchema) =>
      (validateData(data, schema).errors ?? []).map((e: any) => e.message);

    describe('valid rules', () => {
      it('should accept rules stored as JSON (objects, arrays, literals)', () => {
        // Rules shipped in the backend (0060_dd_schema.sql, 0280_user_bookmarks.sql)
        expect(validateData({ if: [{ in: [{ var: 'format' }, ['reference', 'parent']] }, 'required', 'hidden'] }, ruleSchema).valid).toBe(true);
        expect(validateData({ '==': [{ var: 'user_id' }, { var: '$user_id' }] }, ruleSchema).valid).toBe(true);
        expect(validateData({ if: [{ value_changed: 'origin' }, { '==': [{ var: '$old' }, null] }, true] }, ruleSchema).valid).toBe(true);
        expect(validateData([{ var: 'a' }, { var: 'b' }], ruleSchema).valid).toBe(true);
        expect(validateData(true, ruleSchema).valid).toBe(true);
      });

      it('should accept JSON text, as an editor hands it back', () => {
        expect(validateData('{"==": [{"var": "status"}, "open"]}', ruleSchema).valid).toBe(true);
        expect(validateData('true', ruleSchema).valid).toBe(true);
      });

      it('should treat {}, "" and a missing value as "no rule"', () => {
        expect(validateData({}, ruleSchema).valid).toBe(true);
        expect(validateData({ rule: {} }, formSchema()).valid).toBe(true);
        expect(validateData({ rule: '' }, formSchema()).valid).toBe(true);
        expect(validateData({}, formSchema()).valid).toBe(true);
      });

      it('should accept every Semantius operator with valid arguments', () => {
        const rules = [
          { let: ['total', { '+': [{ var: 'a' }, { var: 'b' }] }, { '>': [{ var: 'total' }, 10] }] },
          { set_record: ['order', 'orders', { var: 'order_id' }, { '==': [{ var: 'order.status' }, 'open'] }] },
          { has_permission: 'orders:approve' },
          { require_permission: ['orders:approve'] },
          { concat: ['Order #', { var: 'id' }] },
          { is_match: [{ var: 'email' }, '^[^@]+@[^@]+$'] },
          { throw_error: 'Order is already shipped' },
          { throw_error: ['Order ${id} is already shipped', '99017', ['id', { var: 'id' }]] },
          { throw_error: ['Order is already shipped', 99017] },
          { is_raci_actor: ['orders', 'approved', 'accountable'] },
          { has_consultation: ['orders', 'approved', { var: 'id' }] },
          { '<': [1, { var: 'qty' }, 10] },
          { reduce: [{ var: 'lines' }, { '+': [{ var: 'current.qty' }, { var: 'accumulator' }] }, 0] },
          { missing_some: [1, ['email', 'phone']] }
        ];
        for (const rule of rules) {
          expect(messages(rule)).toEqual([]);
        }
      });

      it('should accept every standard operator with valid arguments', () => {
        const rules = [
          { missing: ['email', 'phone'] },
          { '?:': [{ var: 'active' }, 'yes', 'no'] },
          { '===': [{ var: 'qty' }, 0] },
          { '!=': [{ var: 'status' }, 'closed'] },
          { '!==': [{ var: 'status' }, null] },
          { '!!': [{ var: 'tags' }] },
          { or: [{ var: 'a' }, { var: 'b' }] },
          { '<=': [0, { var: 'qty' }, 10] },
          { max: [{ var: 'a' }, { var: 'b' }] },
          { min: [1, 2, 3] },
          { '-': [{ var: 'total' }, { var: 'discount' }] },
          { '-': { var: 'qty' } },
          { '/': [{ var: 'total' }, 2] },
          { '%': [{ var: 'qty' }, 2] },
          { all: [{ var: 'lines' }, { '>': [{ var: 'qty' }, 0] }] },
          { none: [{ var: 'lines' }, { '==': [{ var: 'qty' }, 0] }] },
          { merge: [[1, 2], [3]] },
          { cat: ['Order #', { var: 'id' }] },
          { substr: [{ var: 'code' }, 0, 3] },
          { log: { var: 'qty' } }
        ];
        for (const rule of rules) {
          expect(messages(rule)).toEqual([]);
        }
      });

      it('should accept computed_fields entries', () => {
        const entries = [{ name: 'total', jsonlogic: { '*': [{ var: 'qty' }, { var: 'price' }] }, description: 'Line total' }];
        expect(validateData(entries, ruleSchema).valid).toBe(true);
      });

      it('should accept validation_rules entries, including platform rules', () => {
        const entries = [
          { code: '99001', message: 'qty must be positive', jsonlogic: { '>': [{ var: 'qty' }, 0] } },
          { code: '90203', message: 'roles.origin is set on INSERT and cannot be changed', source_module: 'platform', jsonlogic: { if: [{ value_changed: 'origin' }, { '==': [{ var: '$old' }, null] }, true] } }
        ];
        expect(validateData(entries, ruleSchema).valid).toBe(true);
      });

      it('should accept variables bound by let', () => {
        expect(messages({ let: ['$limit', 10, { '<': [{ var: 'qty' }, { var: '$limit' }] }] })).toEqual([]);
      });

      it('should accept item fields and names bound inside array operations', () => {
        expect(messages({ filter: [{ var: 'lines' }, { '>': [{ var: 'qty' }, 0] }] })).toEqual([]);
        expect(messages({ map: [{ var: 'lines' }, { let: ['total', { '*': [{ var: 'qty' }, { var: 'price' }] }, { var: 'total' }] }] })).toEqual([]);
        // Only argument 1 is evaluated per item; the array and reduce's initial value see the record
        expect(messages({ reduce: [{ var: 'lines' }, { '+': [{ var: 'current.qty' }, { var: 'accumulator' }] }, { var: '$user_id' }] })).toEqual([]);
      });

      it('should accept format jsonlogic without a type (every JSON type is inferred)', () => {
        expect(validateData({ '==': [1, 1] }, { format: 'jsonlogic' }).valid).toBe(true);
        expect(validateData('{"==": [1, 1]}', { format: 'jsonlogic' }).valid).toBe(true);
      });
    });

    describe('invalid rules', () => {
      it('should reject invalid JSON text, explaining why', () => {
        const [message, ...rest] = messages('{"==": [1, }');
        expect(message).toMatch(/^must be valid JSON: .+/);
        expect(rest).toEqual([]);
      });

      it('should reject values that are not JSON', () => {
        expect(messages({ '==': [{ var: 'qty' }, NaN] })).toEqual(['NaN is not valid JSON at /==/1']);
      });

      it('should reject $ variables and outer let names inside array operations, as the backend does not provide them there', () => {
        expect(messages({ some: [{ var: 'lines' }, { '==': [{ var: 'owner_id' }, { var: '$user_id' }] }] })).toEqual([
          'variable "$user_id" is not available inside "some" logic, which is evaluated against each array item at /some/1/==/1/var'
        ]);
        expect(messages({ let: ['limit', 10, { filter: [{ var: 'lines' }, { '>': [{ var: 'qty' }, { var: 'limit' }] }] }] })).toEqual([
          '"limit" is bound outside "filter" and is not available inside its logic, which is evaluated against each array item at /let/2/filter/1/>/1/var'
        ]);
        expect(messages({ reduce: [{ var: 'lines' }, { '+': [{ var: 'accumulator' }, { var: '$old.qty' }] }, 0] })).toEqual([
          'variable "$old" is not available inside "reduce" logic, which is evaluated against {current, accumulator} at /reduce/1/+/1/var'
        ]);
      });

      it('should reject an unknown operator and suggest the closest one', () => {
        expect(messages({ '=': [{ var: 'status' }, 'open'] })).toEqual(['unknown operator "=" (did you mean "=="?)']);
        expect(messages({ if: [{ value_changd: 'origin' }, true, false] })).toEqual([
          'unknown operator "value_changd" (did you mean "value_changed"?) at /if/0'
        ]);
      });

      it('should reject an object with more than one key', () => {
        const [message] = messages({ '==': [{ var: 'qty' }, 0], and: [true] });
        expect(message).toContain('object has 2 keys ("==", "and")');
        expect(message).toContain('always truthy');
      });

      it('should reject a wrong number of arguments', () => {
        expect(messages({ '==': [1] })).toEqual(['"==" expects 2 arguments, got 1 at /==']);
        // Legal, but the backend ignores the third argument: >= is not "between"
        expect(messages({ '>=': [1, { var: 'qty' }, 10] })).toEqual(['">=" expects 2 arguments, got 3 at />=']);
        expect(messages({ and: [] })).toEqual(['"and" expects at least 1 argument, got 0 at /and']);
      });

      it('should reject a wrong number of arguments for every standard operator with a limit', () => {
        const cases: Array<[object, string]> = [
          [{ '?:': [] }, '"?:" expects at least 1 argument, got 0 at /?:'],
          [{ or: [] }, '"or" expects at least 1 argument, got 0 at /or'],
          [{ max: [] }, '"max" expects at least 1 argument, got 0 at /max'],
          [{ min: [] }, '"min" expects at least 1 argument, got 0 at /min'],
          [{ '===': [1] }, '"===" expects 2 arguments, got 1 at /==='],
          [{ '!=': [1] }, '"!=" expects 2 arguments, got 1 at /!='],
          [{ '!==': [1] }, '"!==" expects 2 arguments, got 1 at /!=='],
          [{ '/': [1] }, '"/" expects 2 arguments, got 1 at /~1'],
          [{ '%': [1] }, '"%" expects 2 arguments, got 1 at /%'],
          [{ all: [{ var: 'lines' }] }, '"all" expects 2 arguments, got 1 at /all'],
          [{ none: [{ var: 'lines' }] }, '"none" expects 2 arguments, got 1 at /none'],
          [{ '!!': [1, 2] }, '"!!" expects 1 argument, got 2 at /!!'],
          [{ log: [1, 2] }, '"log" expects 1 argument, got 2 at /log'],
          [{ '-': [1, 2, 3] }, '"-" expects 1 to 2 arguments, got 3 at /-'],
          [{ '<=': [1] }, '"<=" expects 2 to 3 arguments, got 1 at /<='],
          [{ '<=': [1, 2, 3, 4] }, '"<=" expects 2 to 3 arguments, got 4 at /<='],
          [{ substr: ['abc'] }, '"substr" expects 2 to 3 arguments, got 1 at /substr'],
          [{ substr: ['abc', 0, 1, 2] }, '"substr" expects 2 to 3 arguments, got 4 at /substr']
        ];
        for (const [rule, message] of cases) {
          expect(messages(rule)).toEqual([message]);
        }
      });

      it('should reject an unknown $ variable', () => {
        expect(messages({ '==': [{ var: '$user' }, 1] })).toEqual([
          'unknown variable "$user" (available: "$today", "$now", "$user_id", "$old", "$mode") at /==/0/var'
        ]);
      });

      it('should reject a let or set_record name that is not a literal string', () => {
        expect(messages({ let: [{ var: 'name' }, 1, true] })).toEqual([
          'must be a non-empty variable name (it is not evaluated) at /let/0'
        ]);
        expect(messages({ set_record: ['order', 42, { var: 'id' }, true] })).toEqual([
          'must be an entity name (it is not evaluated) at /set_record/1'
        ]);
      });

      it('should reject invalid throw_error arguments', () => {
        expect(messages({ throw_error: ['msg', '42501'] })).toEqual(['must be a class 99 error code (99000-99999) at /throw_error/1']);
        expect(messages({ throw_error: ['msg', '99001', ['id']] })).toEqual([
          'must contain name, value pairs (an even number of items) at /throw_error/2'
        ]);
        expect(messages({ throw_error: ['msg', '99001', ['entity', 'orders']] })).toEqual([
          '"entity" is a reserved parameter name at /throw_error/2/0'
        ]);
        expect(messages({ throw_error: ['msg', '99017', ['rows', [1, 2]]] })).toEqual([
          'parameter value must be a scalar at /throw_error/2/1'
        ]);
      });

      it('should reject literal arguments of the wrong type', () => {
        expect(messages({ is_raci_actor: ['orders', 'approved', 'owner'] })).toEqual([
          'must be one of "responsible", "accountable", "consulted", "informed" at /is_raci_actor/2'
        ]);
        expect(messages({ has_permission: '' })).toEqual(['must be a permission name at /has_permission']);
        expect(messages({ var: true })).toEqual(['must be a string path, a number or null at /var']);
      });

      it('should reject invalid computed_fields entries', () => {
        expect(messages([{ jsonlogic: { var: 'a' } }])).toEqual(['must be a non-empty string at /0/name']);
        expect(messages([{ name: 'total', jsonlogic: { '+': [{ var: 'a' }, { vra: 'b' }] } }])).toEqual([
          'unknown operator "vra" (did you mean "var"?) at /0/jsonlogic/+/1'
        ]);
      });

      it('should require jsonlogic in every entry', () => {
        expect(messages([{ name: 'a', jsonlogic: true }, { name: 'b' }])).toEqual(['is required at /1/jsonlogic']);
        expect(messages([{ code: '99001', message: 'm', jsonlogic: true }, { code: '99002', message: 'm' }])).toEqual([
          'is required at /1/jsonlogic'
        ]);
      });

      it('should check an array as a rule when no entry has jsonlogic (entries are recognised by that key)', () => {
        // Current behaviour: {"name": "total"} is read as an operation named "name"
        expect(messages([{ name: 'total' }])).toEqual(['unknown operator "name" (did you mean "none"?) at /0']);
      });

      it('should reject invalid validation_rules entries', () => {
        expect(messages([{ code: 'must_be_positive', message: 'm', jsonlogic: true }])).toEqual([
          'must be a class 99 error code (99000-99999) at /0/code'
        ]);
        expect(messages([{ code: '99001', message: 'm', source_module: 'platform', jsonlogic: true }])).toEqual([
          'must be a class 90 error code (90000-90999) for a platform rule at /0/code'
        ]);
        expect(messages([{ name: 'x', jsonlogic: true }, { code: '99001', jsonlogic: true }])).toEqual([
          'must be a class 99 error code (99000-99999) at /0/code',
          'must be a string at /0/message',
          'must be a string at /1/message'
        ]);
      });

      it('should report every problem in a rule', () => {
        expect(messages({ and: [{ '=': [1, 1] }, { '!': [] }] })).toEqual([
          'unknown operator "=" (did you mean "=="?) at /and/0',
          '"!" expects 1 argument, got 0 at /and/1/!'
        ]);
      });
    });

    describe('in an object schema', () => {
      it('should report errors as format errors on the property', () => {
        const result = validateData({ rule: { '=': [1, 1] } }, formSchema());
        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors?.[0]).toMatchObject({
          keyword: 'format',
          instancePath: '/rule',
          params: { format: 'jsonlogic', path: '' },
          message: 'unknown operator "=" (did you mean "=="?)'
        });
      });

      it('should validate a present value on readonly fields, like other formats', () => {
        expect(validateData({ rule: { '=': [1, 1] } }, formSchema('readonly')).valid).toBe(false);
        expect(validateData({ rule: '' }, formSchema('readonly')).valid).toBe(true);
      });

      it('should still require a value when inputMode is required', () => {
        expect(validateData({ rule: '' }, formSchema('required')).valid).toBe(false);
        expect(validateData({ rule: { var: 'a' } }, formSchema('required')).valid).toBe(true);
      });
    });
  });

  describe('Format: reference', () => {
    it('should validate integer values', () => {
      const schema = { type: 'number', format: 'reference' };
      
      expect(validateData(1, schema).valid).toBe(true);
      expect(validateData(0, schema).valid).toBe(true);
      expect(validateData(-5, schema).valid).toBe(true);
      expect(validateData(999999, schema).valid).toBe(true);
    });

    it('should reject non-integer numbers', () => {
      const schema = { type: 'number', format: 'reference' };
      
      expect(validateData(1.5, schema).valid).toBe(false);
      expect(validateData(0.1, schema).valid).toBe(false);
      expect(validateData(3.14159, schema).valid).toBe(false);
    });

    it('should reject non-number values', () => {
      const schema = { type: 'number', format: 'reference' };
      
      expect(validateData('123', schema).valid).toBe(false);
      expect(validateData('1', schema).valid).toBe(false);
      expect(validateData(null, schema).valid).toBe(false);
      expect(validateData(undefined, schema).valid).toBe(false);
      expect(validateData(true, schema).valid).toBe(false);
    });

    it('should work with inputMode required', () => {
      const schema = {
        type: 'object',
        properties: {
          userId: { type: 'number', format: 'reference', inputMode: 'required' }
        }
      };
      
      expect(validateData({ userId: 1 }, schema).valid).toBe(true);
      expect(validateData({ userId: 0 }, schema).valid).toBe(true);
      expect(validateData({ userId: null }, schema).valid).toBe(false);
      expect(validateData({}, schema).valid).toBe(false);
    });
  });

  describe('Format: enum', () => {
    it('should validate values against the enum list', () => {
      const schema = { type: 'string', format: 'enum', enum: ['active', 'inactive'] };

      expect(validateData('active', schema).valid).toBe(true);
      expect(validateData('archived', schema).valid).toBe(false);
    });

    it('should infer type string when no type is given', () => {
      const schema = { format: 'enum', enum: ['active', 'inactive'] };

      expect(validateData('inactive', schema).valid).toBe(true);
      expect(validateData(1, schema).valid).toBe(false);
    });

    it('should work in an object schema with inputMode', () => {
      const schema = {
        type: 'object',
        properties: {
          status: { type: 'string', format: 'enum', enum: ['active', 'inactive'] },
          stage: { type: 'string', format: 'enum', enum: ['draft', 'done'], inputMode: 'required' }
        }
      };

      expect(validateData({ status: 'active', stage: 'draft' }, schema).valid).toBe(true);
      expect(validateData({ status: '', stage: 'done' }, schema).valid).toBe(true);
      expect(validateData({ status: 'active', stage: '' }, schema).valid).toBe(false);
      expect(validateData({ status: 'archived', stage: 'draft' }, schema).valid).toBe(false);
    });
  });

  describe('Format: object', () => {
    it('should accept objects', () => {
      const schema = { type: 'object', format: 'object' };

      expect(validateData({}, schema).valid).toBe(true);
      expect(validateData({ key: 'value' }, schema).valid).toBe(true);
    });

    it('should infer type object when no type is given', () => {
      const schema = { format: 'object' };

      expect(validateData({ key: 'value' }, schema).valid).toBe(true);
      expect(validateData('{"key": "value"}', schema).valid).toBe(false);
      expect(validateData([1, 2], schema).valid).toBe(false);
    });

    it('should work in an object schema', () => {
      const schema = {
        type: 'object',
        properties: {
          settings: { type: 'object', format: 'object', default: {} }
        }
      };

      expect(validateData({ settings: { theme: 'dark' } }, schema).valid).toBe(true);
      expect(validateData({ settings: 'dark' }, schema).valid).toBe(false);
    });
  });

  describe('Format: array', () => {
    it('should accept arrays', () => {
      const schema = { type: 'array', format: 'array' };

      expect(validateData([], schema).valid).toBe(true);
      expect(validateData([1, 'two', { three: 3 }], schema).valid).toBe(true);
    });

    it('should infer type array when no type is given', () => {
      const schema = { format: 'array' };

      expect(validateData(['a', 'b'], schema).valid).toBe(true);
      expect(validateData('a,b', schema).valid).toBe(false);
      expect(validateData({ 0: 'a' }, schema).valid).toBe(false);
    });

    it('should work in an object schema', () => {
      const schema = {
        type: 'object',
        properties: {
          tags: { type: 'array', format: 'array', default: [] }
        }
      };

      expect(validateData({ tags: ['a', 'b'] }, schema).valid).toBe(true);
      expect(validateData({ tags: 'a' }, schema).valid).toBe(false);
    });
  });

  describe('inputMode: required validation', () => {
    it('should reject empty string when inputMode is required', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string', inputMode: 'required' }
        }
      };
      
      const result = validateData({ name: '' }, schema);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.[0]?.keyword).toBe('inputMode');
      expect(result.errors?.[0]?.message).toContain('must not be empty');
    });

    it('should reject null when inputMode is required', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: ['string', 'null'], inputMode: 'required' }
        }
      };
      
      const result = validateData({ name: null }, schema);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.[0]?.keyword).toBe('inputMode');
      expect(result.errors?.[0]?.message).toContain('must not be null or undefined');
    });

    it('should reject undefined when inputMode is required', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string', inputMode: 'required' }
        }
      };
      
      const result = validateData({}, schema);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.[0]?.keyword).toBe('inputMode');
    });

    it('should accept non-empty string when inputMode is required', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string', inputMode: 'required' }
        }
      };
      
      expect(validateData({ name: 'not empty' }, schema).valid).toBe(true);
      expect(validateData({ name: ' ' }, schema).valid).toBe(true);
    });

    it('should reject empty string with any format when inputMode is required', () => {
      const schema = {
        type: 'object',
        properties: {
          jsonField: { type: 'string', format: 'json', inputMode: 'required' },
          htmlField: { type: 'string', format: 'html', inputMode: 'required' },
          textField: { type: 'string', format: 'text', inputMode: 'required' }
        }
      };
      
      expect(validateData({ jsonField: '', htmlField: '', textField: '' }, schema).valid).toBe(false);
      
      const jsonResult = validateData({ jsonField: '', htmlField: '<p>ok</p>', textField: 'ok' }, schema);
      expect(jsonResult.valid).toBe(false);
      
      const htmlResult = validateData({ jsonField: '{}', htmlField: '', textField: 'ok' }, schema);
      expect(htmlResult.valid).toBe(false);
      
      const textResult = validateData({ jsonField: '{}', htmlField: '<p>ok</p>', textField: '' }, schema);
      expect(textResult.valid).toBe(false);
    });

    it('should accept empty string when inputMode is not required', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string', inputMode: 'default' }
        }
      };
      
      expect(validateData({ name: '' }, schema).valid).toBe(true);
    });

    it('should validate multiple fields with inputMode required', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string', inputMode: 'required' },
          email: { type: 'string', format: 'email', inputMode: 'required' },
          notes: { type: 'string' }
        }
      };
      
      // All required fields filled - valid
      expect(validateData({ 
        name: 'John', 
        email: 'john@example.com',
        notes: 'Some notes'
      }, schema).valid).toBe(true);
      
      // Missing required name - invalid
      const result1 = validateData({ 
        email: 'john@example.com',
        notes: 'Some notes'
      }, schema);
      expect(result1.valid).toBe(false);
      expect(result1.errors?.some((e: any) => e.keyword === 'inputMode')).toBe(true);
      
      // Empty required email - invalid
      const result2 = validateData({ 
        name: 'John',
        email: '',
        notes: 'Some notes'
      }, schema);
      expect(result2.valid).toBe(false);
      expect(result2.errors?.some((e: any) => e.keyword === 'inputMode')).toBe(true);
    });
  });

  describe('Precision keyword', () => {
    it('should validate number with correct precision', () => {
      const schema = { type: 'number', precision: 2 };
      
      expect(validateData(10, schema).valid).toBe(true);
      expect(validateData(10.5, schema).valid).toBe(true);
      expect(validateData(10.55, schema).valid).toBe(true);
    });

    it('should reject number with too many decimal places', () => {
      const schema = { type: 'number', precision: 2 };
      
      const result = validateData(10.555, schema);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.[0]?.keyword).toBe('precision');
    });

    it('should validate integer with precision 0', () => {
      const schema = { type: 'number', precision: 0 };
      
      expect(validateData(10, schema).valid).toBe(true);
      expect(validateData(0, schema).valid).toBe(true);
      expect(validateData(-5, schema).valid).toBe(true);
    });

    it('should reject decimal with precision 0', () => {
      const schema = { type: 'number', precision: 0 };
      
      expect(validateData(10.5, schema).valid).toBe(false);
    });

    it('should handle precision values between 0 and 4', () => {
      for (let precision = 0; precision <= 4; precision++) {
        const schema = { type: 'number', precision };
        
        const validNumber = parseFloat('10.' + '5'.repeat(precision));
        expect(validateData(validNumber, schema).valid).toBe(true);
        
        if (precision < 4) {
          const invalidNumber = parseFloat('10.' + '5'.repeat(precision + 1));
          expect(validateData(invalidNumber, schema).valid).toBe(false);
        }
      }
    });
  });

  describe('Type inference', () => {
    it('should infer every JSON type when format json is provided without type', () => {
      const schema = { format: 'json' };

      expect(validateData('{"key": "value"}', schema).valid).toBe(true);
      expect(validateData({ key: 'value' }, schema).valid).toBe(true);
      expect(validateData([1, 2], schema).valid).toBe(true);
    });

    it('should infer integer and number types for numeric formats provided without type', () => {
      expect(validateData(5, { format: 'int32' }).valid).toBe(true);
      expect(validateData('5', { format: 'int32' }).valid).toBe(false);
      expect(validateData(9007199254740991, { format: 'int64' }).valid).toBe(true);
      expect(validateData(1.5, { format: 'double' }).valid).toBe(true);
      expect(validateData(1.5, { format: 'float' }).valid).toBe(true);
      expect(validateData('1.5', { format: 'float' }).valid).toBe(false);
    });

    it('should infer type integer for reference and parent provided without type', () => {
      expect(validateData(7, { format: 'reference' }).valid).toBe(true);
      expect(validateData(7, { format: 'parent' }).valid).toBe(true);
      expect(validateData(1.5, { format: 'reference' }).valid).toBe(false);
    });

    it('should infer type string when a string format is provided without type', () => {
      const schema = { format: 'html' };

      expect(validateData('<p>Hello</p>', schema).valid).toBe(true);
      expect(validateData({ html: '<p>Hello</p>' }, schema).valid).toBe(false);
    });

    it('should validate nested properties with inferred types', () => {
      const schema = {
        type: 'object',
        properties: {
          data: { format: 'json' }  // Every JSON type inferred
        }
      };

      expect(validateData({ data: '{"key": "value"}' }, schema).valid).toBe(true);
      expect(validateData({ data: { key: 'value' } }, schema).valid).toBe(true);
    });

    it('should validate array items with inferred types', () => {
      const schema = {
        type: 'array',
        items: { format: 'html' }  // Type inferred as string
      };
      
      expect(validateData(['<p>Item 1</p>', '<p>Item 2</p>'], schema).valid).toBe(true);
    });
  });

  describe('Standard Formats - email', () => {
    it('should validate valid email addresses', () => {
      const schema = { type: 'string', format: 'email' };
      
      expect(validateData('user@example.com', schema).valid).toBe(true);
      expect(validateData('john.doe@company.co.uk', schema).valid).toBe(true);
    });

    it('should reject invalid email addresses', () => {
      const schema = { type: 'string', format: 'email' };
      
      expect(validateData('not-an-email', schema).valid).toBe(false);
      expect(validateData('missing@domain', schema).valid).toBe(false);
    });
  });

  describe('Standard Formats - date', () => {
    it('should validate valid dates', () => {
      const schema = { type: 'string', format: 'date' };
      
      expect(validateData('2023-12-07', schema).valid).toBe(true);
      expect(validateData('2024-01-01', schema).valid).toBe(true);
    });

    it('should reject invalid dates', () => {
      const schema = { type: 'string', format: 'date' };
      
      expect(validateData('2023-13-45', schema).valid).toBe(false);
      expect(validateData('not-a-date', schema).valid).toBe(false);
    });
  });

  describe('Standard Formats - uri', () => {
    it('should validate valid URIs', () => {
      const schema = { type: 'string', format: 'uri' };
      
      expect(validateData('https://example.com', schema).valid).toBe(true);
      expect(validateData('ftp://files.example.org', schema).valid).toBe(true);
    });

    it('should reject invalid URIs', () => {
      const schema = { type: 'string', format: 'uri' };
      
      expect(validateData('not a uri', schema).valid).toBe(false);
    });
  });

  describe('Standard Formats - iri (implemented by us)', () => {
    it('should validate valid IRIs', () => {
      const schema = { type: 'string', format: 'iri' };
      
      expect(validateData('https://example.com', schema).valid).toBe(true);
      expect(validateData('http://例え.jp', schema).valid).toBe(true);
    });

    it('should validate data URLs', () => {
      const schema = { type: 'string', format: 'iri' };
      
      expect(validateData('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmZmZmYiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBjbGFzcz0ibHVjaWRlIGx1Y2lkZS1zZXR0aW5ncy1pY29uIGx1Y2lkZS1zZXR0aW5ncyI+PHBhdGggZD0iTTkuNjcxIDQuMTM2YTIuMzQgMi4zNCAwIDAgMSA0LjY1OSAwIDIuMzQgMi4zNCAwIDAgMCAzLjMxOSAxLjkxNSAyLjM0IDIuMzQgMCAwIDEgMi4zMyA0LjAzMyAyLjM0IDIuMzQgMCAwIDAgMCAzLjgzMSAyLjM0IDIuMzQgMCAwIDEtMi4zMyA0LjAzMyAyLjM0IDIuMzQgMCAwIDAtMy4zMTkgMS45MTUgMi4zNCAyLjM0IDAgMCAxLTQuNjU5IDAgMi4zNCAyLjM0IDAgMCAwLTMuMzItMS45MTUgMi4zNCAyLjM0IDAgMCAxLTIuMzMtNC4wMzMgMi4zNCAyLjM0IDAgMCAwIDAtMy44MzFBMi4zNCAyLjM0IDAgMCAxIDYuMzUgNi4wNTFhMi4zNCAyLjM0IDAgMCAwIDMuMzE5LTEuOTE1Ii8+PGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMyIvPjwvc3ZnPg==', schema).valid).toBe(true);
      expect(validateData('data:text/plain;charset=utf-8,Hello%20World', schema).valid).toBe(true);
    });

    it('should reject data URLs with characters a URI or IRI must percent-encode, as uri does', () => {
      const schema = { type: 'string', format: 'iri' };

      expect(validateData('data:text/html,<h1>Hello</h1>', schema).valid).toBe(false);
      expect(validateData('data:text/html,%3Ch1%3EHello%3C%2Fh1%3E', schema).valid).toBe(true);
    });

    it('should validate mailto URLs', () => {
      const schema = { type: 'string', format: 'iri' };
      
      expect(validateData('mailto:support@test.com', schema).valid).toBe(true);
      expect(validateData('mailto:user@example.org?subject=Test', schema).valid).toBe(true);
    });

    it('should reject invalid IRIs', () => {
      const schema = { type: 'string', format: 'iri' };
      
      expect(validateData('not an iri', schema).valid).toBe(false);
      expect(validateData('', schema).valid).toBe(false);
    });
  });

  describe('Standard Formats - iri-reference (implemented by us)', () => {
    it('should validate valid IRI references', () => {
      const schema = { type: 'string', format: 'iri-reference' };
      
      expect(validateData('https://example.com', schema).valid).toBe(true);
      expect(validateData('/path/to/resource', schema).valid).toBe(true);
      expect(validateData('../relative', schema).valid).toBe(true);
      expect(validateData('#fragment', schema).valid).toBe(true);
    });

    it('should reject invalid IRI references', () => {
      const schema = { type: 'string', format: 'iri-reference' };
      
      expect(validateData('has spaces', schema).valid).toBe(false);
      expect(validateData('has<brackets>', schema).valid).toBe(false);
    });
  });

  describe('Standard Formats - idn-email (implemented by us)', () => {
    it('should validate valid IDN emails', () => {
      const schema = { type: 'string', format: 'idn-email' };
      
      expect(validateData('user@example.com', schema).valid).toBe(true);
      expect(validateData('用户@例え.jp', schema).valid).toBe(true);
    });

    it('should reject invalid IDN emails', () => {
      const schema = { type: 'string', format: 'idn-email' };
      
      expect(validateData('not-an-email', schema).valid).toBe(false);
      expect(validateData('@nodomain', schema).valid).toBe(false);
      expect(validateData('user@', schema).valid).toBe(false);
    });
  });

  describe('Standard Formats - idn-hostname (implemented by us)', () => {
    it('should validate valid IDN hostnames', () => {
      const schema = { type: 'string', format: 'idn-hostname' };
      
      expect(validateData('example.com', schema).valid).toBe(true);
      expect(validateData('例え.jp', schema).valid).toBe(true);
      expect(validateData('subdomain.example.com', schema).valid).toBe(true);
    });

    it('should reject invalid IDN hostnames', () => {
      const schema = { type: 'string', format: 'idn-hostname' };
      
      expect(validateData('.starts-with-dot', schema).valid).toBe(false);
      expect(validateData('-starts-with-dash', schema).valid).toBe(false);
    });

    it('should accept a fully qualified name ending with a dot, as hostname does', () => {
      const schema = { type: 'string', format: 'idn-hostname' };

      expect(validateData('ends-with-dot.', schema).valid).toBe(true);
      expect(validateData('müller.de.', schema).valid).toBe(true);
    });
  });

  describe('Standard formats accept Unicode and validate the same as their idn/iri names', () => {
    const cases: Array<[string, string, Array<[string, boolean]>]> = [
      ['email', 'idn-email', [
        ['joerg@mueller.de', true],
        ['jörg@müller.de', true],
        ['用户@例え.jp', true],
        ['joerg@xn--mller-kva.de', true],
        ['jörg@müller', false],
        ['jö rg@müller.de', false],
        ['jörg @müller.de', false],
        ['jörg..x@müller.de', false],
        ['jörg@mül ler.de', false],
        ['a@b@müller.de', false],
        ['@müller.de', false]
      ]],
      ['hostname', 'idn-hostname', [
        ['mueller.de', true],
        ['müller.de', true],
        ['例え.jp', true],
        ['xn--mller-kva.de', true],
        ['müller..de', false],
        ['-müller.de', false],
        ['müller-.de', false],
        ['müller.de/pfad', false],
        ['jörg@müller.de', false],
        ['mül ler.de', false],
        [`${'ü'.repeat(70)}.de`, false]
      ]],
      ['uri', 'iri', [
        ['https://example.com/a', true],
        ['https://müller.de/straße?q=größe#top', true],
        ['http://例え.jp', true],
        ['mailto:jörg@müller.de', true],
        ['/straße', false],
        ['müller.de', false],
        ['https://mül ler.de', false]
      ]],
      ['uri-reference', 'iri-reference', [
        ['https://müller.de/straße', true],
        ['/straße', true],
        ['../größe', true],
        ['#größe', true],
        ['straße mit leerzeichen', false],
        ['<straße>', false]
      ]]
    ];

    describe.each(cases)('%s and %s', (standard, internationalized, values) => {
      it.each(values)('%s is valid: %s', (value, valid) => {
        expect(validateData(value, { type: 'string', format: standard }).valid).toBe(valid);
        expect(validateData(value, { type: 'string', format: internationalized }).valid).toBe(valid);
      });
    });
  });

  describe('Standard JSON Schema required array (object-level)', () => {
    it('should reject missing property when in required array', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          email: { type: 'string' }
        },
        required: ['name']
      };
      
      // Missing required 'name' property - should fail
      const result = validateData({ email: 'john@example.com' }, schema);
      expect(result.valid).toBe(false);
      expect(result.errors?.[0]?.keyword).toBe('required');
    });

    it('should accept empty string for property in required array (standard behavior)', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' }
        },
        required: ['name']
      };
      
      // Property exists but is empty string - should pass (standard JSON Schema)
      const result = validateData({ name: '' }, schema);
      expect(result.valid).toBe(true);
    });

    it('should accept property with value when in required array', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          email: { type: 'string' }
        },
        required: ['name']
      };
      
      expect(validateData({ name: 'John' }, schema).valid).toBe(true);
      expect(validateData({ name: 'John', email: 'john@example.com' }, schema).valid).toBe(true);
    });

    it('should differentiate between required array and inputMode required', () => {
      const schema = {
        type: 'object',
        properties: {
          // Standard required: property must exist, but empty string is OK
          field1: { type: 'string' },
          // inputMode required: property must have non-empty value
          field2: { type: 'string', inputMode: 'required' }
        },
        required: ['field1']
      };
      
      // field1 with empty string - valid (required array allows empty)
      expect(validateData({ field1: '', field2: 'value' }, schema).valid).toBe(true);
      
      // field1 missing - invalid (required array)
      expect(validateData({ field2: 'value' }, schema).valid).toBe(false);
      
      // field2 with empty string - invalid (inputMode: required)
      const result = validateData({ field1: 'value', field2: '' }, schema);
      expect(result.valid).toBe(false);
      expect(result.errors?.some((e: any) => e.keyword === 'inputMode')).toBe(true);
    });
  });

  describe('Enum with inputMode validation', () => {
    it('should allow empty string in enum without inputMode: required', () => {
      const schema = {
        type: 'object',
        properties: {
          status: { 
            type: 'string',
            enum: ['active', 'inactive', 'pending']
            // No inputMode: required, so empty should be allowed
          }
        }
      };
      
      // Empty string should be valid when inputMode is not "required"
      const result = validateData({ status: '' }, schema);
      expect(result.valid).toBe(true);
    });

    it('should reject empty string in enum with inputMode: required', () => {
      const schema = {
        type: 'object',
        properties: {
          status: { 
            type: 'string',
            enum: ['active', 'inactive', 'pending'],
            inputMode: 'required'
          }
        }
      };
      
      // Empty string should be invalid when inputMode is "required"
      const result = validateData({ status: '' }, schema);
      expect(result.valid).toBe(false);
      expect(result.errors?.[0]?.keyword).toBe('inputMode');
      expect(result.errors?.[0]?.message).toContain('must not be empty');
    });

    it('should accept valid enum value without inputMode: required', () => {
      const schema = {
        type: 'object',
        properties: {
          status: { 
            type: 'string',
            enum: ['active', 'inactive', 'pending']
          }
        }
      };
      
      expect(validateData({ status: 'active' }, schema).valid).toBe(true);
      expect(validateData({ status: 'inactive' }, schema).valid).toBe(true);
      expect(validateData({ status: 'pending' }, schema).valid).toBe(true);
    });

    it('should accept valid enum value with inputMode: required', () => {
      const schema = {
        type: 'object',
        properties: {
          status: { 
            type: 'string',
            enum: ['active', 'inactive', 'pending'],
            inputMode: 'required'
          }
        }
      };
      
      expect(validateData({ status: 'active' }, schema).valid).toBe(true);
      expect(validateData({ status: 'inactive' }, schema).valid).toBe(true);
      expect(validateData({ status: 'pending' }, schema).valid).toBe(true);
    });

    it('should reject invalid enum value regardless of inputMode', () => {
      const schemaWithoutRequired = {
        type: 'object',
        properties: {
          status: { 
            type: 'string',
            enum: ['active', 'inactive', 'pending']
          }
        }
      };
      
      const schemaWithRequired = {
        type: 'object',
        properties: {
          status: { 
            type: 'string',
            enum: ['active', 'inactive', 'pending'],
            inputMode: 'required'
          }
        }
      };
      
      expect(validateData({ status: 'invalid' }, schemaWithoutRequired).valid).toBe(false);
      expect(validateData({ status: 'invalid' }, schemaWithRequired).valid).toBe(false);
    });

    it('should not add empty string to enum if already present', () => {
      const schema = {
        type: 'object',
        properties: {
          status: { 
            type: 'string',
            enum: ['', 'active', 'inactive']
            // Empty string already in enum
          }
        }
      };
      
      // Empty string should be valid
      expect(validateData({ status: '' }, schema).valid).toBe(true);
      expect(validateData({ status: 'active' }, schema).valid).toBe(true);
    });
  });

  describe('inputMode: readonly/disabled/hidden validation', () => {
    it('should NOT validate constraints for empty readonly fields', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { 
            type: 'string', 
            minLength: 5,
            inputMode: 'readonly' 
          }
        }
      };
      
      // Empty readonly field should pass even with minLength constraint
      const result = validateData({ name: '' }, schema);
      expect(result.valid).toBe(true);
    });

    it('should NOT validate constraints for empty disabled fields', () => {
      const schema = {
        type: 'object',
        properties: {
          email: { 
            type: 'string', 
            format: 'email',
            minLength: 5,
            inputMode: 'disabled' 
          }
        }
      };
      
      // Empty disabled field should pass even with minLength and format constraints
      const result = validateData({ email: '' }, schema);
      expect(result.valid).toBe(true);
    });

    it('should NOT validate constraints for empty hidden fields', () => {
      const schema = {
        type: 'object',
        properties: {
          id: { 
            type: 'string', 
            pattern: '^[0-9]+$',
            minLength: 3,
            inputMode: 'hidden' 
          }
        }
      };
      
      // Empty hidden field should pass even with pattern and minLength constraints
      const result = validateData({ id: '' }, schema);
      expect(result.valid).toBe(true);
    });

    it('should validate format when readonly field has non-empty value', () => {
      const schema = {
        type: 'object',
        properties: {
          email: { 
            type: 'string', 
            format: 'email',
            inputMode: 'readonly' 
          }
        }
      };
      
      // Invalid email should fail validation
      const invalidResult = validateData({ email: 'not-an-email' }, schema);
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors?.[0]?.keyword).toBe('format');
      
      // Valid email should pass
      const validResult = validateData({ email: 'user@example.com' }, schema);
      expect(validResult.valid).toBe(true);
    });

    it('should validate format when disabled field has non-empty value', () => {
      const schema = {
        type: 'object',
        properties: {
          url: { 
            type: 'string', 
            format: 'uri',
            inputMode: 'disabled' 
          }
        }
      };
      
      // Invalid URL should fail validation
      const invalidResult = validateData({ url: 'not a url' }, schema);
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors?.[0]?.keyword).toBe('format');
      
      // Valid URL should pass
      const validResult = validateData({ url: 'https://example.com' }, schema);
      expect(validResult.valid).toBe(true);
    });

    it('should NOT validate pattern for hidden fields regardless of value', () => {
      const schema = {
        type: 'object',
        properties: {
          code: { 
            type: 'string', 
            pattern: '^[A-Z]{3}$',
            inputMode: 'hidden' 
          }
        }
      };
      
      // Invalid pattern should still pass (pattern not enforced on hidden)
      const invalidResult = validateData({ code: 'ABC123' }, schema);
      expect(invalidResult.valid).toBe(true);
      
      // Valid pattern should pass
      const validResult = validateData({ code: 'ABC' }, schema);
      expect(validResult.valid).toBe(true);
    });

    it('should NOT validate minLength/maxLength for empty readonly fields with required', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { 
            type: 'string', 
            minLength: 5,
            maxLength: 50,
            inputMode: 'readonly' 
          }
        },
        required: ['name']
      };
      
      // Empty readonly field should pass even with schema-level required and minLength/maxLength
      const result = validateData({ name: '' }, schema);
      expect(result.valid).toBe(true);
    });

    it('should NOT validate minLength/maxLength/pattern for readonly fields regardless of value', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { 
            type: 'string', 
            minLength: 5,
            inputMode: 'readonly' 
          }
        }
      };
      
      // Too short value should still pass (minLength not enforced on readonly)
      const invalidResult = validateData({ name: 'abc' }, schema);
      expect(invalidResult.valid).toBe(true);
      
      // Any length should pass
      const validResult = validateData({ name: 'abcde' }, schema);
      expect(validResult.valid).toBe(true);
    });

    it('should handle multiple readonly fields with different validation rules', () => {
      const schema = {
        type: 'object',
        properties: {
          email: { 
            type: 'string', 
            format: 'email',
            minLength: 5,
            inputMode: 'readonly' 
          },
          age: {
            type: 'number',
            minimum: 0,
            inputMode: 'readonly'
          },
          status: {
            type: 'string',
            enum: ['active', 'inactive'],
            inputMode: 'disabled'
          }
        }
      };
      
      // All empty should pass
      const emptyResult = validateData({ email: '', age: null, status: '' }, schema);
      expect(emptyResult.valid).toBe(true);
      
      // Valid values should pass
      const validResult = validateData({ 
        email: 'user@example.com', 
        age: 25,
        status: 'active'
      }, schema);
      expect(validResult.valid).toBe(true);
      
      // Invalid email format should fail (has value, so format is checked)
      const invalidEmailResult = validateData({ 
        email: 'invalid', 
        age: 25,
        status: 'active'
      }, schema);
      expect(invalidEmailResult.valid).toBe(false);
      expect(invalidEmailResult.errors?.[0]?.keyword).toBe('format');
    });
  });

});
