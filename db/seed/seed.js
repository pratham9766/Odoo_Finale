// Seed v1: the two demo mills with all their masters (backend plan §17, step 1–3). Run: npm run seed (from server/).
//
// Connects as the migration role (bypasses RLS), builds everything in ONE transaction, and refuses to run on a
// database that already has the demo orgs. Deterministic: the same SEED always produces the same world.
// seedAll() takes its two outside collaborators as arguments, so tests can run it without Supabase or Vipul's code.

import { pathToFileURL } from 'node:url';
import { DEMO_PASSWORD, PROFILES, SEED } from './config.js';
import { seedAccess } from './generators/access.js';
import { seedCatalog } from './generators/catalog.js';
import { seedContacts } from './generators/contacts.js';
import { seedFactory } from './generators/factory.js';
import { seedOrganization } from './generators/organizations.js';
import { seedWorkers } from './generators/workers.js';
import { createRng } from './lib/rng.js';

async function assertNotSeeded(db) {
  const names = Object.values(PROFILES).map((p) => p.org.name);
  const { rows } = await db.query(`select name from organizations where name = any($1::text[])`, [names]);
  if (rows.length) {
    throw new Error(`Demo data already exists (${rows.map((r) => r.name).join(', ')}). Run the demo reset script, or use an empty database.`);
  }
}

/**
 * @param {{ query: Function }} db  pg Client or PGlite
 * @param {{ createUser: Function, createDefaultRoles: Function, log?: Function }} deps
 * @returns {Promise<Array<object>>} one summary per organization (counts + the demo kiosk token)
 */
export async function seedAll(db, { createUser, createDefaultRoles, log = () => {} }) {
  const rng = createRng(SEED);
  const summaries = [];

  await db.query('begin');
  try {
    await assertNotSeeded(db);
    for (const [key, profile] of Object.entries(PROFILES)) {
      const org = await seedOrganization(db, profile.org, rng);
      const factory = await seedFactory(db, org.id, profile, rng);
      const workers = await seedWorkers(db, org.id, profile, factory, rng);
      const catalog = await seedCatalog(db, org.id, profile, factory);
      const contacts = await seedContacts(db, org.id, profile);
      const access = await seedAccess(db, org, profile, { ...factory, ...workers }, { createUser, createDefaultRoles });

      const summary = {
        key, orgId: org.id, name: org.name, connectCode: org.connect_code,
        machines: Object.keys(factory.machineId).length, workers: Object.keys(workers.workerId).length,
        items: Object.keys(catalog.itemId).length, boms: catalog.bomCount, contacts: contacts.length, users: access.users,
        kioskDevices: factory.kioskDevices,
      };
      summaries.push(summary);
      log(`${org.name}: ${summary.machines} machines, ${summary.workers} workers, ${summary.items} items, ${summary.boms} BOMs, ${summary.contacts} contacts, ${summary.users} logins`);
    }
    await db.query('commit');
  } catch (err) {
    await db.query('rollback');
    throw err;
  }
  return summaries;
}

// ---- command line -------------------------------------------------------------------------

const need = (name) => process.env[name] || (() => { throw new Error(`${name} is not set (see server/.env.example)`); })();

async function loadDefaultRoles() {
  try {
    return await import('../../server/src/modules/staff/defaultRoles.js');
  } catch (err) {
    if (err.code !== 'ERR_MODULE_NOT_FOUND') throw err;
    throw new Error('server/src/modules/staff/defaultRoles.js is missing: it must export createDefaultRoles(db, orgId, types) → Map(roleName → roleId).', { cause: err });
  }
}

async function main() {
  await import('dotenv/config');
  const { default: pg } = await import('pg');
  const { supabaseUserCreator } = await import('./supabaseUsers.js');
  const { createDefaultRoles } = await loadDefaultRoles();

  const createUser = await supabaseUserCreator({ url: need('SUPABASE_URL'), serviceKey: need('SUPABASE_SERVICE_ROLE_KEY'), password: DEMO_PASSWORD });
  const client = new pg.Client({ connectionString: need('MIGRATION_DATABASE_URL'), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const summaries = await seedAll(client, { createUser, createDefaultRoles, log: console.log });
    console.log(`\nDemo logins use password ${DEMO_PASSWORD} (e.g. owner@everest.demo).`);
    for (const s of summaries) for (const d of s.kioskDevices) console.log(`${s.name} kiosk "${d.name}" device token: ${d.token}`);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error(`\nSeed failed: ${err.message}`); process.exit(1); });
}
