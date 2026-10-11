// The shared PostgreSQL connection pool, with money, counts and dates converted to plain JavaScript values.
import pg from 'pg';
import { env } from '../config/env.js';

// numeric → JS number (fine for our ranges; money stays rounded to 2 dp)
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
// int8 (count(*)) → JS number
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));
// date → 'YYYY-MM-DD' string (avoid timezone shifts)
pg.types.setTypeParser(1082, (v) => v);

const ssl = /localhost|127\.0\.0\.1/.test(env.DATABASE_URL) ? false : { rejectUnauthorized: false };

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  keepAlive: true,                // keep idle sockets alive through NAT / pooler idle timeouts
  keepAliveInitialDelayMillis: 10_000,
  ssl,
});

pool.on('error', (err) => console.error('[pg pool]', err.message));
