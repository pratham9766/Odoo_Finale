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
import { loadServerEnv, requireServer } from '../lib/serverDeps.js';

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

// npm run seed                  masters + 90-day history + connected portals (about an hour: every step goes through the real services)
// npm run seed -- --days=14     a shorter history (the quick demo seed)
// npm run seed -- --masters     only seed v1: orgs, users, machines, workers, items, BOMs (seconds)
const flag = (name) => process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`))?.split('=')[1] ?? (process.argv.includes(`--${name}`) ? true : undefined);

async function main() {
  loadServerEnv();                       // before any server module is imported: they validate the environment
  const pg = requireServer('pg');
  const { supabaseUserCreator } = await import('./supabaseUsers.js');
  const { createDefaultRoles } = await import('../../server/src/modules/staff/defaultRoles.js');

  const createUser = await supabaseUserCreator({ url: need('SUPABASE_URL'), serviceKey: need('SUPABASE_SERVICE_ROLE_KEY'), password: DEMO_PASSWORD });
  const client = new pg.Client({ connectionString: need('MIGRATION_DATABASE_URL'), ssl: { rejectUnauthorized: false } });
  client.on('error', (e) => console.warn(`[seed] masters connection dropped after use (${e.code ?? e.message}); not needed any more`));
  await client.connect();
  try {
    const summaries = await seedAll(client, { createUser, createDefaultRoles, log: console.log });

    if (!flag('masters')) {
      const { simulate } = await import('./simulation/run.js');
      const { seedB2B } = await import('./b2b.js');
      const days = Number(flag('days')) || undefined;
      // a long job must survive a dropped connection: a pool reconnects, and one retry covers the query that was in flight
      const pool = new pg.Pool({ connectionString: need('MIGRATION_DATABASE_URL'), ssl: { rejectUnauthorized: false }, max: 3 });
      pool.on('error', (e) => console.warn(`[seed] idle connection dropped (${e.code ?? e.message}); reconnecting on next query`));
      const TRANSIENT = new Set(['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', '57P01', '08006', '08003']);
      const admin = {
        async query(text, params) {
          for (let attempt = 1; ; attempt++) {
            try { return await pool.query(text, params); } catch (err) {
              if (!TRANSIENT.has(err.code) || attempt >= 4) throw err;
              await new Promise((r) => setTimeout(r, 500 * attempt));
            }
          }
        },
      };
      try {
        console.log(`\nSimulating ${days ?? 90} days of Everest's history …`);
        const result = await simulate(admin, { days, log: console.log });
        console.log(`History done: ${result.orders} orders, ${result.rolls} rolls, ${result.insights} insights.`);
        await seedB2B(admin, { createUser, log: console.log });
      } finally {
        await pool.end();
      }
    }

    const portals = flag('masters') ? '' : ', buyer@metrofashion.demo, driver@speedfreight.demo, admin@texlink.demo';
    console.log(`\nDemo logins use password ${DEMO_PASSWORD} (e.g. owner@everest.demo${portals}).`);
    for (const s of summaries) for (const d of s.kioskDevices) console.log(`${s.name} kiosk "${d.name}" device token: ${d.token}`);
  } finally {
    await client.end();
    // the simulation used the server's own pools
    for (const mod of ['db/pool.js', 'db/aiPool.js']) {
      try { await (await import(`../../server/src/${mod}`))[mod.includes('ai') ? 'aiPool' : 'pool'].end(); } catch { /* never opened */ }
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error(`\nSeed failed: ${err.message}`); process.exit(1); });
}
