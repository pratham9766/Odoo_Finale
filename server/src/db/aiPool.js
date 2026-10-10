import pg from 'pg';
import { env } from '../config/env.js';
import './pool.js'; // registers the shared type parsers

const ssl = /localhost|127\.0\.0\.1/.test(env.AI_DATABASE_URL) ? false : { rejectUnauthorized: false };

export const aiPool = new pg.Pool({
  connectionString: env.AI_DATABASE_URL,
  max: 3,
  ssl,
});

aiPool.on('error', (err) => console.error('[pg aiPool]', err.message));
