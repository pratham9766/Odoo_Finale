// withTx(): runs a function in one database transaction (commit on success, rollback on error) and retries flaky connects.
import { pool } from './pool.js';

const TRANSIENT = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED']);

// connecting is safe to retry (no statement has run yet); flaky DNS/network must not fail a request
async function connect() {
  for (let attempt = 1; ; attempt++) {
    try {
      return await pool.connect();
    } catch (err) {
      if (!TRANSIENT.has(err.code) || attempt >= 3) throw err;
      await new Promise((r) => setTimeout(r, 250 * attempt));
    }
  }
}

/** Run `fn(db)` inside one transaction: committed when it returns, rolled back when it throws. */
export async function withTx(fn) {
  const client = await connect();
  // a socket that drops while the transaction is between statements must fail the next query, not crash the process
  const onError = (err) => console.warn('[db] connection error during a request:', err.code ?? err.message);
  client.on('error', onError);
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.off('error', onError);
    client.release();
  }
}
