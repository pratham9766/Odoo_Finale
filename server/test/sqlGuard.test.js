import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guardSql } from '../src/modules/ai/sqlGuard.js';

const allowed = ['v_stock', 'v_order_progress'];
const rejects = (sql, re = /./) => assert.throws(() => guardSql(sql, allowed), (e) => e.code === 'AI_UNSAFE_SQL' && re.test(e.message), sql);

test('accepts a plain select on an allowed view and wraps it with a row limit', () => {
  assert.equal(guardSql('select name, available from v_stock where is_low order by name;', allowed),
    'select * from (select name, available from v_stock where is_low order by name) as q limit 200');
});

test('accepts CTEs, explicit joins, public. prefix and quoted identifiers', () => {
  guardSql('with low as (select item_id, name from v_stock where is_low) select * from low', allowed);
  guardSql('select s.name, o.order_no from v_stock s join v_order_progress o on o.order_id is not null', allowed);
  guardSql('select * from public.v_stock', allowed);
  guardSql('select name from "v_stock" group by name, kind order by name, kind', allowed);
  guardSql("select name from v_stock where kind in ('yarn','fibre')", allowed);
});

test('rejects anything that is not a read', () => {
  rejects('delete from v_stock', /SELECT/);
  rejects('update v_stock set name = 1', /SELECT/);
  rejects('drop table items', /SELECT/);
  rejects('insert into items values (1)', /SELECT/);
  rejects('select 1; drop table items', /Multiple/);
  rejects('with x as (delete from items returning *) select * from x', /Forbidden/);
  rejects('select * from v_stock into temp t', /Forbidden/);
});

test('rejects comments, multiple statements and hidden payloads', () => {
  rejects('select * from v_stock -- where org_id = 1', /Comments/);
  rejects('select * from v_stock /* x */', /Comments/);
  rejects('select * from v_stock; select * from v_stock', /Multiple/);
});

test('rejects base tables, system catalogs and other schemas', () => {
  rejects('select * from items', /Not allowed to read/);
  rejects('select * from audit_logs', /Not allowed to read/);
  rejects('select * from v_stock join staff_invites on true', /Not allowed to read/);
  rejects('select * from pg_catalog.pg_tables', /System schemas/);
  rejects('select * from information_schema.tables', /System schemas/);
  rejects('select * from auth.users', /System schemas/);
  rejects('select * from (select * from profiles) x', /Not allowed to read/);
});

test('rejects comma joins that would smuggle in an unchecked table', () => {
  rejects('select * from v_stock, items', /JOIN/);
  rejects('select * from v_stock s, v_order_progress o', /JOIN/);
});

test('rejects dangerous functions and settings', () => {
  rejects("select set_config('app.org_id', 'x', false)", /Forbidden/);
  rejects("select current_setting('app.org_id')", /Forbidden/);
  rejects('select pg_sleep(10)', /Forbidden/);
  rejects("select pg_read_file('/etc/passwd')", /Forbidden/);
  rejects('select * from v_stock, lateral (select 1) x', /Forbidden|JOIN/);
});

test('rejects queries with no allowed source, and empty input', () => {
  rejects('select 1', /allowed view/);
  rejects('', /Empty/);
  rejects(null, /Empty/);
});

test('a view that is not in the caller\'s allowed list is rejected', () => {
  assert.throws(() => guardSql('select * from v_monthly_pnl', allowed), (e) => e.code === 'AI_UNSAFE_SQL');
});
