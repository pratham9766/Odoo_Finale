// Applies db/migrations/*.sql in order, once each, using MIGRATION_DATABASE_URL (postgres role).
//   npm run migrate              (from server/)
//   npm run migrate -- --local   (plain local Postgres: creates a fake auth.users table first)
//   npm run migrate -- --status  (list applied / pending)
import { readdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, '../server/package.json'));
const pg = require('pg');
require('dotenv').config({ path: path.join(here, '../server/.env'), quiet: true });

const args = new Set(process.argv.slice(2));
const url = process.env.MIGRATION_DATABASE_URL;
if (!url) {
  console.error('MIGRATION_DATABASE_URL is not set (server/.env)');
  process.exit(1);
}

// {{NAME}} placeholders in SQL are filled from env (role passwords); never commit real secrets
const PLACEHOLDERS = {
  APP_USER_PASSWORD: process.env.APP_USER_PASSWORD,
};
function fill(sql, file) {
  return sql.replace(/\{\{([A-Z_]+)\}\}/g, (_, k) => {
    const v = PLACEHOLDERS[k];
    if (!v) throw new Error(`${file}: env ${k} is required`);
    return v.replace(/'/g, "''");
  });
}

const LOCAL_AUTH = `
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text unique);
`;

const local = args.has('--local') || /localhost|127\.0\.0\.1/.test(url);
const client = new pg.Client({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  if (local) await client.query(LOCAL_AUTH);
  await client.query(`create table if not exists public.schema_migrations (
    name text primary key, applied_at timestamptz not null default now())`);

  const dir = path.join(here, 'migrations');
  const files = (await readdir(dir)).filter((f) => /^\d+_.*\.sql$/.test(f)).sort();
  const { rows } = await client.query('select name from public.schema_migrations');
  const applied = new Set(rows.map((r) => r.name));

  if (args.has('--status')) {
    for (const f of files) console.log(`${applied.has(f) ? '✔' : '·'} ${f}`);
    return;
  }

  let n = 0;
  for (const f of files) {
    if (applied.has(f)) continue;
    const sql = fill(await readFile(path.join(dir, f), 'utf8'), f);
    process.stdout.write(`→ ${f} ... `);
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('insert into public.schema_migrations (name) values ($1)', [f]);
      await client.query('COMMIT');
      console.log('ok');
      n++;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.log('FAILED');
      console.error(`${f}: ${err.message}${err.position ? ` (at char ${err.position})` : ''}`);
      process.exitCode = 1;
      return;
    }
  }
  console.log(n ? `Applied ${n} migration(s).` : 'Nothing to apply.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => client.end());
