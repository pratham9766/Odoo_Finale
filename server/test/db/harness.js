// Database-backed test harness. These tests run the REAL services against a REAL PostgreSQL, so transactions, row locks,
// unique constraints and migrations are exercised, not mocked.
//
//   SAMETA_TEST_ADMIN_URL=postgresql://postgres:<password>@127.0.0.1:5432/postgres  npm run test:db
//
// The URL must point at a LOCAL, disposable PostgreSQL server. For every test file this creates a brand-new database, applies
// db/migrations with the real db/migrate.js, and drops it afterwards. It refuses any non-local host and never touches a database
// it did not create itself. Without the variable the db tests are skipped (the normal `npm test` stays offline).

import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrate = path.resolve(here, '../../../db/migrate.js');
export const ADMIN_URL = process.env.SAMETA_TEST_ADMIN_URL;
export const enabled = Boolean(ADMIN_URL);
const APP_PASSWORD = 'test-only-password';

const withDb = (url, name) => { const u = new URL(url); u.pathname = `/${name}`; return u.toString(); };

/** Create + migrate a throw-away database and point the server's environment at it. Call before importing any server module. */
export async function bootDatabase() {
  const admin = new URL(ADMIN_URL);
  if (!['localhost', '127.0.0.1', '::1'].includes(admin.hostname)) throw new Error(`SAMETA_TEST_ADMIN_URL must be a local server, got ${admin.hostname}`);
  const name = `sameta_test_${process.pid}_${Date.now()}`;
  const root = new pg.Client({ connectionString: withDb(ADMIN_URL, 'postgres') });
  await root.connect();
  for (const role of ['anon', 'authenticated', 'service_role']) {       // Supabase provides these; plain PostgreSQL does not
    await root.query(`do $$ begin if not exists (select 1 from pg_roles where rolname = '${role}') then create role ${role} nologin; end if; end $$`);
  }
  await root.query(`create database ${name} encoding 'UTF8' template template0 lc_collate 'C' lc_ctype 'C'`);
  await root.end();

  const run = spawnSync(process.execPath, [migrate], {
    env: { ...process.env, MIGRATION_DATABASE_URL: withDb(ADMIN_URL, name), APP_USER_PASSWORD: APP_PASSWORD }, encoding: 'utf8',
  });
  if (run.status !== 0) throw new Error(`migrations failed:\n${run.stdout}\n${run.stderr}`);

  const app = new URL(withDb(ADMIN_URL, name));
  app.username = 'app_user';
  app.password = APP_PASSWORD;
  Object.assign(process.env, {
    DATABASE_URL: app.toString(), NODE_ENV: 'test', JOBS_ENABLED: 'false',
    CLIENT_URL: 'http://localhost:5173', SUPABASE_URL: 'http://127.0.0.1:1', SUPABASE_SERVICE_ROLE_KEY: 'test-only',
    PUBLIC_TRACK_BASE_URL: 'http://localhost:5173/track',
  });
  const pool = new pg.Pool({ connectionString: withDb(ADMIN_URL, name), max: 4 });
  return {
    name, pool,
    q: (sql, params) => pool.query(sql, params).then((r) => r.rows),
    async drop() {
      await pool.end();
      const { pool: appPool } = await import('../../src/db/pool.js');
      await appPool.end();
      const c = new pg.Client({ connectionString: withDb(ADMIN_URL, 'postgres') });
      await c.connect();
      await c.query(`drop database if exists ${name} with (force)`);
      await c.end();
    },
  };
}

/** An empty, UTF-8 database on the local test server (no migrations applied), for tests that drive the migration runner themselves. */
export async function createEmptyDatabase(label = 'empty') {
  const admin = new URL(ADMIN_URL);
  if (!['localhost', '127.0.0.1', '::1'].includes(admin.hostname)) throw new Error(`SAMETA_TEST_ADMIN_URL must be a local server, got ${admin.hostname}`);
  const name = `sameta_test_${label}_${process.pid}_${Date.now()}`;
  const root = new pg.Client({ connectionString: withDb(ADMIN_URL, 'postgres') });
  await root.connect();
  for (const role of ['anon', 'authenticated', 'service_role']) {
    await root.query(`do $$ begin if not exists (select 1 from pg_roles where rolname = '${role}') then create role ${role} nologin; end if; end $$`);
  }
  await root.query(`create database ${name} encoding 'UTF8' template template0 lc_collate 'C' lc_ctype 'C'`);
  await root.end();
  return {
    name, url: withDb(ADMIN_URL, name), password: APP_PASSWORD,
    async drop() {
      const c = new pg.Client({ connectionString: withDb(ADMIN_URL, 'postgres') });
      await c.connect();
      await c.query(`drop database if exists ${name} with (force)`);
      await c.end();
    },
  };
}

/** A small mill: shifts covering 24 h, two stages, one machine, an order with a work order, workers, and staff with real roles. */
export async function seedWorld(db) {
  const { q } = db;
  const id = () => randomUUID();
  await q(`insert into mill (name) values ('Test Mill')`);

  const role = async (name) => (await q(`select id from roles where name = $1`, [name]))[0].id;
  await q(`insert into roles (name, rank, is_system) values ('TestOwner', 100, true)`);
  await q(`insert into role_permissions (role_id, permission_key) select r.id, p.key from roles r cross join permissions p where r.name = 'TestOwner'`);
  const staff = {};
  for (const [key, roleName] of [['owner', 'TestOwner'], ['supervisor', 'Supervisor'], ['operator', 'Operator'], ['qc', 'QC Inspector'], ['office', 'Office'], ['store', 'Store Keeper']]) {
    const uid = id();
    await q(`insert into auth.users (id, email) values ($1, $2)`, [uid, `${key}@test.local`]);
    await q(`insert into profiles (id, email, full_name, role_id, status) values ($1, $2, $3, $4, 'active')`, [uid, `${key}@test.local`, `Test ${key}`, await role(roleName)]);
    staff[key] = uid;
  }

  const shifts = {};
  for (const [name, s, e] of [['A', '06:00', '14:00'], ['B', '14:00', '22:00'], ['C', '22:00', '06:00']]) {
    shifts[name] = (await q(`insert into shifts (name, start_time, end_time) values ($1, $2, $3) returning id`, [name, s, e]))[0].id;
  }
  const stageWeave = (await q(`insert into stages (name, sequence) values ('Weaving', 1) returning id`))[0].id;
  const stageLast = (await q(`insert into stages (name, sequence) values ('Finishing', 2) returning id`))[0].id;
  const machine = (await q(`insert into machines (code, stage_id, capacity_per_hour, capacity_uom) values ('M-01', $1, 50, 'm') returning id`, [stageLast]))[0].id;
  const item = (await q(`insert into items (kind, name, uom) values ('finished_fabric', 'Cotton poplin', 'm') returning id`))[0].id;
  const buyer = (await q(`insert into contacts (type, name) values ('buyer', 'Test Buyer') returning id`))[0].id;

  const makeOrder = async (no, qty) => {
    const order = (await q(`insert into orders (order_no, buyer_contact_id, deadline, status) values ($1, $2, current_date + 30, 'in_production') returning id`, [no, buyer]))[0].id;
    const line = (await q(`insert into order_lines (order_id, item_id, qty, uom) values ($1, $2, $3, 'm') returning id`, [order, item, qty]))[0].id;
    return { order, line };
  };
  const o1 = await makeOrder('ORD-T-0001', 1000);
  const o2 = await makeOrder('ORD-T-0002', 1000);

  const wo = async (no, o, target, status = 'running') => (await q(
    `insert into work_orders (wo_no, order_id, order_line_id, stage_id, output_item_id, machine_id, target_qty, uom, status, started_at)
     values ($1, $2, $3, $4, $5, $6, $7, 'm', $8, now()) returning id`, [no, o.order, o.line, stageLast, item, machine, target, status]))[0].id;
  const workOrder = await wo('WO-T-1', o1, 100);
  await q(`update machines set status = 'running', current_work_order_id = $1, status_since = now() - interval '30 minutes' where id = $2`, [workOrder, machine]);

  const worker = async (code, name, wageType, rate, extra = {}) => (await q(
    `insert into workers (emp_code, name, wage_type, rate, ot_rate, stage_id, default_shift_id, active) values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
    [code, name, wageType, rate, rate, stageLast, shifts.A, extra.active ?? true]))[0].id;
  const workers = {
    ravi: await worker('E-001', 'Ravi', 'hourly', 100),
    priya: await worker('E-002', 'Priya', 'daily', 800),
    inactive: await worker('E-003', 'Old Hand', 'daily', 700, { active: false }),
  };
  return { staff, shifts, stageWeave, stageLast, machine, item, buyer, orders: { o1, o2 }, workOrder, workers, makeOrder, wo };
}

/** The signed-in context the middleware would build for this user (real roles and permissions from the database). */
export async function ctxFor(userId) {
  const { loadContext } = await import('../../src/middleware/staff.js');
  return loadContext(userId);
}

/** A card scanner device row, as POST /iot/rfid-scan would find it. */
export async function seedDevice(db, code = 'GATE_01') {
  return (await db.q(`insert into rfid_devices (code, name, kind, key_hash) values ($1, $1, 'hardware', repeat('a', 64)) returning id, code`, [code]))[0];
}

/** A past date in the middle of last month (so it is not in the future and not near a month edge). */
export function pastDay() {
  const d = new Date();
  d.setUTCDate(15);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 10);
}
