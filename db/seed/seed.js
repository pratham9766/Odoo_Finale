// Seed: Everest Textile Mills with all its masters (stages, machines, shifts, workers, items, BOMs, buyers, suppliers, demo logins),
// then (unless --masters) a replay of its history through the real services.  Run: npm run seed (from server/).
//
// Connects as the migration role, builds the masters in ONE transaction, and refuses to run on a database that already has the mill.
// Deterministic: the same SEED always produces the same world.
// seedAll() takes its two outside collaborators as arguments, so it can run without Supabase.

import { pathToFileURL } from 'node:url';
import { DEMO_PASSWORD, PROFILE, SEED } from './config.js';
import { seedAccess } from './generators/access.js';
import { seedCatalog } from './generators/catalog.js';
import { seedContacts } from './generators/contacts.js';
import { seedFactory } from './generators/factory.js';
import { seedMill } from './generators/mill.js';
import { seedTeam } from './generators/team.js';
import { seedWorkers } from './generators/workers.js';
import { createRng } from './lib/rng.js';
import { loadServerEnv, requireServer } from '../lib/serverDeps.js';

async function assertNotSeeded(db) {
  const { rows } = await db.query(`select name from mill`);
  if (rows.length) {
    throw new Error(`The mill already exists (${rows[0].name}). Run the demo reset script, or use an empty database.`);
  }
}

/**
 * @param {{ query: Function }} db  pg Client
 * @param {{ createUser: Function, createDefaultRoles: Function, log?: Function }} deps
 * @returns {Promise<object>} counts
 */
export async function seedAll(db, { createUser, createDefaultRoles, log = () => {} }) {
  const rng = createRng(SEED);

  await db.query('begin');
  try {
    await assertNotSeeded(db);
    const mill = await seedMill(db, PROFILE.org);
    const factory = await seedFactory(db, PROFILE, rng);
    const workers = await seedWorkers(db, PROFILE, factory, rng);
    const catalog = await seedCatalog(db, PROFILE, factory);
    const contacts = await seedContacts(db, PROFILE);
    const access = await seedAccess(db, PROFILE, { ...factory, ...workers }, { createUser, createDefaultRoles });
    const team = await seedTeam(db, PROFILE, { createUser });

    const summary = {
      name: mill.name,
      machines: Object.keys(factory.machineId).length, workers: Object.keys(workers.workerId).length,
      items: Object.keys(catalog.itemId).length, boms: catalog.bomCount, contacts: contacts.length, users: access.users + team.users, roles: team.roles + 1,
    };
    log(`${mill.name}: ${summary.machines} machines, ${summary.workers} workers, ${summary.items} items, ${summary.boms} BOMs, ${summary.contacts} buyers/suppliers, ${summary.roles} roles, ${summary.users} logins`);
    await db.query('commit');
    return summary;
  } catch (err) {
    await db.query('rollback');
    throw err;
  }
}

// ---- command line -------------------------------------------------------------------------

// plain local Postgres (docker) needs no SSL; Supabase does
const sslFor = (url) => (/localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false });

const need = (name) => process.env[name] || (() => { throw new Error(`${name} is not set (see server/.env.example)`); })();

// npm run seed                  masters + 30-day history
// npm run seed -- --days=14     a shorter history
// npm run seed -- --masters     only the masters: mill, users, machines, workers, items, BOMs (seconds)
const flag = (name) => process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`))?.split('=')[1] ?? (process.argv.includes(`--${name}`) ? true : undefined);

async function main() {
  loadServerEnv();                       // before any server module is imported: they validate the environment
  const pg = requireServer('pg');
  const { supabaseUserCreator } = await import('./supabaseUsers.js');
  const { createDefaultRoles } = await import('../../server/src/modules/staff/defaultRoles.js');

  const createRemoteUser = await supabaseUserCreator({ url: need('SUPABASE_URL'), serviceKey: need('SUPABASE_SERVICE_ROLE_KEY'), password: DEMO_PASSWORD });
  const client = new pg.Client({ connectionString: need('MIGRATION_DATABASE_URL'), ssl: sslFor(need('MIGRATION_DATABASE_URL')) });
  client.on('error', (e) => console.warn(`[seed] masters connection dropped after use (${e.code ?? e.message}); not needed any more`));
  await client.connect();
  const isLocal = !sslFor(need('MIGRATION_DATABASE_URL'));
  // on a local database the login still lives in Supabase Auth; its id is mirrored into the local auth.users stub so foreign keys hold
  const createUser = async (user) => {
    const id = await createRemoteUser(user);
    if (isLocal) await client.query('insert into auth.users (id, email) values ($1, $2) on conflict (id) do nothing', [id, user.email]);
    return id;
  };
  try {
    await seedAll(client, { createUser, createDefaultRoles, log: console.log });

    if (!flag('masters')) {
      const { simulate } = await import('./simulation/run.js');
      const days = Number(flag('days')) || undefined;
      // a long job must survive a dropped connection: a pool reconnects, and one retry covers the query that was in flight
      const pool = new pg.Pool({ connectionString: need('MIGRATION_DATABASE_URL'), ssl: sslFor(need('MIGRATION_DATABASE_URL')), max: 3, keepAlive: true, keepAliveInitialDelayMillis: 10_000 });
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
        console.log(`\nSimulating ${days ?? 30} days of Everest's history …`);
        const result = await simulate(admin, { days, log: console.log });
        console.log(`History done: ${result.orders} orders, ${result.rolls} rolls.`);
      } finally {
        await pool.end();
      }
    }

    console.log(`\nLogin: owner@everest.demo / ${DEMO_PASSWORD}. Add everyone else from Settings → Roles and Settings → Staff (invites by email).`);
  } finally {
    await client.end();
    // the simulation used the server's own pool
    try { await (await import('../../server/src/db/pool.js')).pool.end(); } catch { /* never opened */ }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error(`\nSeed failed: ${err.message}`); if (process.env.SEED_DEBUG) console.error(err.stack, err.details ?? ""); process.exit(1); });
}
