// RFID demo setup (development only): the four demo workers with their physical cards, and scanner GATE_01.
//   npm run seed:rfid          (from server/; safe to run any number of times)
//
// Idempotent and non-destructive:
//   - a worker is matched by employee code (DEMO-RAVI ...); existing rows are reused, never duplicated or overwritten;
//   - a demo worker without a card, or still holding an old placeholder card, gets the physical card below; a different
//     physical card assigned later in the app is kept;
//   - a UID already held by somebody else is skipped and reported (one active owner per card is also a DB constraint);
//   - attendance and scans are never touched.
// Scanner: RFID_DEMO_DEVICE_ID (default GATE_01) is registered with RFID_DEMO_DEVICE_KEY from server/.env. When the key is
// missing, a random one is generated and written to server/.env (never printed); only its SHA-256 hash goes to the database.
// The UIDs live only here and in the database; scan processing looks them up like any other card.

import { createHash, randomBytes } from 'node:crypto';
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadServerEnv, requireServer, serverEnvPath } from '../lib/serverDeps.js';

export const DEMO_WORKERS = [
  { emp_code: 'DEMO-RAVI', name: 'Ravi', skill: 'Weaver', department: 'Weaving', work_area: 'Loom 01', stage: 'Weaving', card_uid: '72FAC35C' },
  { emp_code: 'DEMO-PRIYA', name: 'Priya', skill: 'Dyeing Operator', department: 'Dyeing', work_area: 'Dyeing 01', stage: 'Dyeing', card_uid: '31636E40' },
  { emp_code: 'DEMO-ARJUN', name: 'Arjun', skill: 'QC Inspector', department: 'Quality Control', work_area: 'QC Station', stage: null, card_uid: '91B76E40' },
  { emp_code: 'DEMO-MEENA', name: 'Meena', skill: 'Production Supervisor', department: 'Production', work_area: 'Production Floor', stage: null, card_uid: '51278B40' },
];

/** @param {{ query: Function }} db  pg client; runs in one transaction */
export async function seedRfidDemo(db, { deviceId, deviceKey } = {}, log = console.log) {
  await db.query('begin');
  try {
    const { rows: mill } = await db.query('select name from mill');
    if (!mill.length) throw new Error('No mill in this database. Run the main seed first.');

    await db.query(`insert into rfid_devices (code, name, kind) values ('VIRTUAL_SCANNER', 'Virtual scanner (simulator)', 'virtual')
                    on conflict (code) do nothing`);

    for (const d of DEMO_WORKERS) {
      // the stage of that name that has machines (the demo mill's later stages); null when there is none
      const { rows: [stage] } = d.stage
        ? await db.query(`select id from stages where name = $1 order by sequence desc limit 1`, [d.stage])
        : { rows: [] };

      let { rows: [worker] } = await db.query(`select id, name, active from workers where emp_code = $1`, [d.emp_code]);
      if (worker) {
        // fill only what is missing; never overwrite edits made in the app
        await db.query(`update workers set department = coalesce(department, $2), work_area = coalesce(work_area, $3) where id = $1`,
          [worker.id, d.department, d.work_area]);
        log(`  worker ${d.emp_code} (${worker.name}) already exists, reused`);
      } else {
        // no default shift: the scan falls back to the shift running at that moment (see rfid.rules.js)
        ({ rows: [worker] } = await db.query(
          `insert into workers (emp_code, name, skill, department, work_area, stage_id, wage_type, rate, ot_rate, employment_type)
           values ($1, $2, $3, $4, $5, $6, 'daily', 650, 100, 'permanent') returning id, name, active`,
          [d.emp_code, d.name, d.skill, d.department, d.work_area, stage?.id ?? null]));
        log(`  worker ${d.emp_code} (${d.name}) created`);
      }

      const { rows: [card] } = await db.query(`select id, card_uid, is_placeholder from rfid_credentials where worker_id = $1 and active`, [worker.id]);
      if (card?.card_uid === d.card_uid) {
        log(`    card ${d.card_uid} already assigned, kept`);
        continue;
      }
      if (card && !card.is_placeholder) {
        log(`    has physical card ${card.card_uid} assigned in the app, kept (expected ${d.card_uid})`);
        continue;
      }
      const { rows: [taken] } = await db.query(
        `select w.emp_code from rfid_credentials c join workers w on w.id = c.worker_id where c.card_uid = $1 and c.active`, [d.card_uid]);
      if (taken) {
        log(`    card ${d.card_uid} is in use by ${taken.emp_code}; skipped (fix it in the app)`);
        continue;
      }
      if (card) {                         // the old placeholder: deactivate, keep for history
        await db.query(`update rfid_credentials set active = false, deactivated_at = now(), updated_at = now() where id = $1`, [card.id]);
      }
      await db.query(`insert into rfid_credentials (worker_id, card_uid, is_placeholder) values ($1, $2, false)`, [worker.id, d.card_uid]);
      log(`    card ${d.card_uid} assigned${card ? ` (replaced placeholder ${card.card_uid})` : ''}`);
    }

    if (deviceId && deviceKey) {
      const hash = createHash('sha256').update(deviceKey, 'utf8').digest('hex');
      const { rows: [device] } = await db.query(`select kind, key_hash, active from rfid_devices where code = $1`, [deviceId]);
      if (!device) {
        await db.query(`insert into rfid_devices (code, name, kind, key_hash) values ($1, 'Demo gate scanner', 'hardware', $2)`, [deviceId, hash]);
        log(`  scanner ${deviceId} registered`);
      } else if (device.kind !== 'hardware') {
        throw new Error(`${deviceId} exists but is not a hardware scanner`);
      } else if (device.key_hash !== hash) {
        await db.query(`update rfid_devices set key_hash = $2, updated_at = now() where code = $1`, [deviceId, hash]);
        log(`  scanner ${deviceId} key updated to match RFID_DEMO_DEVICE_KEY`);
      } else {
        log(`  scanner ${deviceId} already registered with this key${device.active ? '' : ' (INACTIVE: switch it on in the app)'}`);
      }
    }
    await db.query('commit');
  } catch (err) {
    await db.query('rollback').catch(() => {});
    throw err;
  }
}

/** The demo scanner's key from server/.env; generated and saved there (not printed) the first time. */
function demoDeviceKey() {
  let key = process.env.RFID_DEMO_DEVICE_KEY;
  if (key) return key;
  key = randomBytes(32).toString('hex');
  const current = readFileSync(serverEnvPath, 'utf8');
  const lead = current.endsWith('\n') ? '\n' : '\n\n';
  appendFileSync(serverEnvPath, `${lead}# RFID demo scanner (generated by npm run seed:rfid). Copy into the ESP32 config.h as DEVICE_KEY.\nRFID_DEMO_DEVICE_KEY=${key}\n`);
  console.log('  generated RFID_DEMO_DEVICE_KEY and saved it to server/.env');
  return key;
}

async function main() {
  loadServerEnv();
  if (process.env.NODE_ENV === 'production') throw new Error('seed:rfid is a development-only demo seed; refusing to run with NODE_ENV=production');
  const deviceId = (process.env.RFID_DEMO_DEVICE_ID || 'GATE_01').toUpperCase();
  if (!/^[A-Z0-9_-]{2,40}$/.test(deviceId) || deviceId === 'VIRTUAL_SCANNER') throw new Error('RFID_DEMO_DEVICE_ID must be letters, digits, _ or -');
  const deviceKey = demoDeviceKey();
  const pg = requireServer('pg');
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set (server/.env)');
  const client = new pg.Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } });
  await client.connect();
  try {
    console.log('RFID demo setup');
    await seedRfidDemo(client, { deviceId, deviceKey });
    console.log('Done.');
  } finally {
    await client.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
