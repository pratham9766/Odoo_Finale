// Demo reset (backend plan §19): empty every tenant table, delete the demo logins from Supabase Auth, then (optionally) seed again.
//   npm run reset -- --yes               empty + seed with the default options
//   npm run reset -- --yes --no-seed     only empty
//   npm run reset -- --yes --days=14     empty + a shorter history
// Keeps: permissions, the schema_migrations ledger, the DB roles. Refuses to run with NODE_ENV=production.
// Only auth users whose email ends in ".demo" are deleted.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadServerEnv, requireServer } from '../lib/serverDeps.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const KEEP = new Set(['permissions', 'schema_migrations']);

if (process.env.NODE_ENV === 'production') { console.error('Refusing to reset a production database.'); process.exit(1); }
if (!process.argv.includes('--yes')) { console.error('This empties every tenant table. Re-run with --yes to confirm.'); process.exit(1); }

loadServerEnv();
const pg = requireServer('pg');
const { createClient } = requireServer('@supabase/supabase-js');

const client = new pg.Client({ connectionString: process.env.MIGRATION_DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const tables = (await client.query(`select tablename from pg_tables where schemaname = 'public'`)).rows
    .map((r) => r.tablename).filter((t) => !KEEP.has(t));
  await client.query(`truncate ${tables.map((t) => `public."${t}"`).join(', ')} restart identity cascade`);
  console.log(`Emptied ${tables.length} tables.`);
} finally {
  await client.end();
}

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }).auth.admin;
let removed = 0;
for (let page = 1; ; page++) {
  const { data, error } = await admin.listUsers({ page, perPage: 200 });
  if (error) throw error;
  for (const u of data.users) {
    if (/\.demo$/i.test(u.email ?? '')) { await admin.deleteUser(u.id); removed++; }
  }
  if (data.users.length < 200) break;
}
console.log(`Deleted ${removed} demo login(s).`);

if (process.argv.includes('--no-seed')) process.exit(0);
const passthrough = process.argv.slice(2).filter((a) => a !== '--yes' && a !== '--no-seed');
const res = spawnSync(process.execPath, [path.join(here, 'seed.js'), ...passthrough], { stdio: 'inherit' });
process.exit(res.status ?? 1);
