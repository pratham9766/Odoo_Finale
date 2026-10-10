// Provision a physical RFID scanner (ESP32) and print its device key ONCE. Only the SHA-256 hash is stored.
//   npm run rfid:device -- GATE_01 "Main gate"     register a new scanner
//   npm run rfid:device -- GATE_01 --rotate        issue a new key (the old one stops working)
// The same can be done in the app: RFID attendance → Scanners (rfid.manage).

import { createHash, randomBytes } from 'node:crypto';
import { loadServerEnv, requireServer } from './lib/serverDeps.js';

const args = process.argv.slice(2);
const rotate = args.includes('--rotate');
const [code, name] = args.filter((a) => !a.startsWith('--'));

if (!code || !/^[A-Z0-9_-]{2,40}$/.test(code) || code === 'VIRTUAL_SCANNER') {
  console.error('Usage: npm run rfid:device -- <DEVICE_CODE> ["name"] [--rotate]   (code: A-Z, 0-9, _ or -)');
  process.exit(1);
}

loadServerEnv();
const pg = requireServer('pg');
const url = process.env.DATABASE_URL;
const client = new pg.Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } });

const key = randomBytes(32).toString('hex');
const hash = createHash('sha256').update(key, 'utf8').digest('hex');

try {
  await client.connect();
  const { rows } = rotate
    ? await client.query(`update rfid_devices set key_hash = $2, updated_at = now() where code = $1 and kind = 'hardware' returning code`, [code, hash])
    : await client.query(`insert into rfid_devices (code, name, kind, key_hash) values ($1, $2, 'hardware', $3)
                          on conflict (code) do nothing returning code`, [code, name ?? null, hash]);
  if (!rows.length) {
    console.error(rotate ? `No hardware scanner ${code}.` : `Scanner ${code} already exists. Use --rotate to issue a new key.`);
    process.exitCode = 1;
  } else {
    console.log(`Scanner ${code} ${rotate ? 'key rotated' : 'registered'}.`);
    console.log('Put this in the ESP32 config.h as DEVICE_KEY. It is shown only now:\n');
    console.log(`  ${key}\n`);
  }
} finally {
  await client.end();
}
