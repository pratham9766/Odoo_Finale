// Read-only infrastructure check. Never print connection strings or credentials.
import 'dotenv/config';
import pg from 'pg';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: true }, connectionTimeoutMillis: 10000 });
try {
  await client.connect();
  const { rows } = await client.query(`select current_user as role,
    to_regclass('public.organizations') is not null as organizations_ready,
    to_regclass('public.orders') is not null as orders_ready,
    to_regclass('public.v_stock') is not null as stock_ready,
    to_regclass('public.machines') is not null as machines_ready`);
  console.log(JSON.stringify(rows[0]));
} catch (error) {
  console.error('Database connection check failed:', error.code || error.name);
  process.exitCode = 1;
} finally { await client.end(); }
