import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Filter, insertClause, pick, setClause } from '../src/utils/crud/sql.js';
import { randomToken, sha256Hex } from '../src/utils/tokens.js';

test('Filter numbers parameters in order', () => {
  const f = new Filter();
  assert.equal(f.sql, 'true');
  f.eq('t.stage_id', 'st-1').eq('t.active', false).eq('t.status', undefined).eq('t.shift', null);
  assert.equal(f.sql, 't.stage_id = $1 and t.active = $2');
  assert.deepEqual(f.params, ['st-1', false]);     // false is a real filter, undefined / null are skipped
});

test('Filter.isNull: true → is null, false → is not null, undefined → no condition', () => {
  assert.equal(new Filter().isNull('t.machine_id', true).sql, 't.machine_id is null');
  assert.equal(new Filter().isNull('t.machine_id', false).sql, 't.machine_id is not null');
  assert.equal(new Filter().isNull('t.machine_id', undefined).sql, 'true');
});

test('Filter.anyOf: empty or missing scope means the whole mill', () => {
  assert.equal(new Filter().anyOf('t.id', undefined).anyOf('t.id', []).sql, 'true');
  const f = new Filter().anyOf('t.stage_id', ['a', 'b']);
  assert.equal(f.sql, 't.stage_id = any($1::uuid[])');
  assert.deepEqual(f.params, [['a', 'b']]);
});

test('Filter.search escapes LIKE wildcards and ORs the columns on one parameter', () => {
  const f = new Filter().search(['t.name', 't.emp_code'], '50%_off\\');
  assert.equal(f.sql, '(t.name ilike $1 or t.emp_code ilike $1)');
  assert.deepEqual(f.params, ['%50\\%\\_off\\\\%']);
  assert.equal(new Filter().search(['t.name'], '').sql, 'true');
});

test('Filter.params is a copy', () => {
  const f = new Filter();
  f.params.push('x');
  assert.deepEqual(f.params, []);
});

test('pick keeps only allowed keys that were sent; null is a value, undefined is not', () => {
  assert.deepEqual(pick({ a: 1, b: null, c: undefined, evil: 'x' }, ['a', 'b', 'c', 'd']), { a: 1, b: null });
});

test('setClause / insertClause number placeholders from firstIndex', () => {
  assert.deepEqual(setClause({ name: 'x', active: false }, 3), { sql: 'name = $3, active = $4', values: ['x', false] });
  assert.deepEqual(insertClause({ org_id: 'o', name: 'x' }),
    { columns: 'org_id, name', placeholders: '$1, $2', values: ['o', 'x'] });
});

test('tokens: random, url-safe, right length; sha256Hex is the hex digest', () => {
  assert.match(randomToken(), /^[A-Za-z0-9_-]{16}$/);
  assert.match(randomToken(32), /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(randomToken(), randomToken());
  assert.equal(sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
