import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createEmptyDatabase, enabled } from './harness.js';

// The migration runner (db/migrate.js) records applied migrations by FULL FILE NAME and applies pending ones in sorted-name
// order, once each, each in its own transaction. It stores no checksum and ignores the numeric prefix. That is why two branches
// that both made a "019" and a "020" can be merged WITHOUT renaming anything: every file keeps the name any database already
// recorded, so nothing is re-applied or skipped. docs/MIGRATIONS.md has the full strategy.

const here = path.dirname(fileURLToPath(import.meta.url));
const dbDir = path.resolve(here, '../../../db');
const all = readdirSync(path.join(dbDir, 'migrations')).filter((f) => /^\d+_.*\.sql$/.test(f)).sort();

// Migrations that exist twice at the same number, because two branches each created one. Names are frozen: do not rename them.
const FROM_MAIN = ['019_review_repairs.sql', '020_rfid_attendance.sql'];
const FROM_MOBILE_BRANCH = ['019_default_role_permissions.sql', '020_employee_role.sql'];
const LEGACY_DUPLICATE_PREFIXES = new Set(['019', '020']);

describe('migration naming policy (offline)', () => {
  test('every file name is unique and well formed', () => {
    assert.equal(new Set(all).size, all.length);
    for (const f of all) assert.match(f, /^\d{3}_[a-z0-9_]+\.sql$/, f);
  });

  test('the four legacy 019/020 files keep their names, and only 019 and 020 are shared prefixes', () => {
    for (const f of [...FROM_MAIN, ...FROM_MOBILE_BRANCH]) assert.ok(all.includes(f), `${f} must not be renamed or removed`);
    const byPrefix = Map.groupBy(all, (f) => f.slice(0, 3));
    for (const [prefix, files] of byPrefix) {
      if (files.length > 1) assert.ok(LEGACY_DUPLICATE_PREFIXES.has(prefix), `new migrations need a unique number; ${prefix} is shared by ${files.join(', ')}`);
    }
  });

  test('new migrations come after the legacy ones', () => {
    for (const f of all.filter((n) => !LEGACY_DUPLICATE_PREFIXES.has(n.slice(0, 3)) && Number(n.slice(0, 3)) > 18)) assert.ok(Number(f.slice(0, 3)) > 20, f);
  });
});

describe('migration histories converge (real PostgreSQL)', { skip: !enabled && 'set SAMETA_TEST_ADMIN_URL to a local PostgreSQL to run' }, () => {
  const created = [];
  const tmpRoots = [];
  after(async () => {
    for (const d of created) await d.drop();
    for (const t of tmpRoots) rmSync(t, { recursive: true, force: true });
  });

  /** Run the real db/migrate.js against `db`, but only with the given migration files (a copy of the db folder in a scratch dir). */
  function migrateWith(db, files) {
    const root = path.join(here, `.tmp-migrate-${process.pid}-${tmpRoots.length}`);
    tmpRoots.push(root);
    mkdirSync(path.join(root, 'server'), { recursive: true });
    mkdirSync(path.join(root, 'db/migrations'), { recursive: true });
    writeFileSync(path.join(root, 'server/package.json'), '{}');
    cpSync(path.join(dbDir, 'migrate.js'), path.join(root, 'db/migrate.js'));
    cpSync(path.join(dbDir, 'package.json'), path.join(root, 'db/package.json'));
    for (const f of files) cpSync(path.join(dbDir, 'migrations', f), path.join(root, 'db/migrations', f));
    const run = spawnSync(process.execPath, [path.join(root, 'db/migrate.js')], {
      env: { ...process.env, MIGRATION_DATABASE_URL: db.url, APP_USER_PASSWORD: db.password }, encoding: 'utf8',
    });
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
    return run.stdout;
  }

  async function snapshot(db) {
    const c = new pg.Client({ connectionString: db.url });
    await c.connect();
    const q = async (sql) => (await c.query(sql)).rows;
    const out = {
      ledger: (await q(`select name from schema_migrations order by name`)).map((r) => r.name),
      permissions: (await q(`select key from permissions order by key`)).map((r) => r.key),
      roles: await q(`select name, rank from roles order by name`),
      rolePermissions: (await q(`select r.name, count(*)::int n from role_permissions rp join roles r on r.id = rp.role_id group by r.name order by r.name`)),
      columns: (await q(`select table_name || '.' || column_name as c from information_schema.columns where table_schema = 'public' order by 1`)).map((r) => r.c),
    };
    await c.end();
    return out;
  }
  const open = async (label) => { const d = await createEmptyDatabase(label); created.push(d); return d; };

  test('A. a fresh empty database applies every migration', async () => {
    const db = await open('fresh');
    const out = migrateWith(db, all);
    assert.match(out, new RegExp(`Applied ${all.length} migration`));
    assert.deepEqual((await snapshot(db)).ledger, all);
  });

  test('B. a database already migrated from main only applies what it is missing', async () => {
    const db = await open('main');
    migrateWith(db, all.filter((f) => !FROM_MOBILE_BRANCH.includes(f) && Number(f.slice(0, 3)) <= 20));
    const out = migrateWith(db, all);
    assert.match(out, new RegExp(`Applied ${FROM_MOBILE_BRANCH.length + all.filter((f) => Number(f.slice(0, 3)) > 20).length} migration`));
    for (const f of FROM_MAIN) assert.doesNotMatch(out, new RegExp(`→ ${f}`), `${f} must not run twice`);
    assert.deepEqual((await snapshot(db)).ledger, all);
  });

  test('C. a database already migrated from the mobile branch only applies what it is missing', async () => {
    const db = await open('mobile');
    migrateWith(db, all.filter((f) => !FROM_MAIN.includes(f) && Number(f.slice(0, 3)) <= 20));
    const out = migrateWith(db, all);
    assert.match(out, new RegExp(`Applied ${FROM_MAIN.length + all.filter((f) => Number(f.slice(0, 3)) > 20).length} migration`));
    for (const f of FROM_MOBILE_BRANCH) assert.doesNotMatch(out, new RegExp(`→ ${f}`), `${f} must not run twice`);
    assert.deepEqual((await snapshot(db)).ledger, all);
  });

  test('all three histories end in the same schema, permissions and roles; running again changes nothing', async () => {
    const [fresh, main, mobile] = await Promise.all(['fresh', 'main', 'mobile'].map(async (l) => created.find((d) => d.name.includes(`_${l}_`))));
    const [a, b, c] = [await snapshot(fresh), await snapshot(main), await snapshot(mobile)];
    assert.deepEqual(b, a, 'main-first history differs from a fresh database');
    assert.deepEqual(c, a, 'mobile-first history differs from a fresh database');
    assert.match(migrateWith(mobile, all), /Nothing to apply/);
  });
});
