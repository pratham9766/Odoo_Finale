// Idempotency for writes whose response can get lost (phone on a bad network): the client sends one `Idempotency-Key` per
// logical submission and reuses it on every retry of that same submission.
//
//   first request      → the business change AND the stored response are committed in one transaction
//   retry, same input  → the stored response is returned, nothing is changed again (meta.replayed = true)
//   same key, new input → 409 IDEMPOTENCY_KEY_REUSED
//   same key at once   → serialised by an advisory lock, so the change is recorded once
// A request that fails (validation, state, 5xx before commit) stores nothing, so the same key may be retried.
// The key is scoped to the signed-in user and the operation name, so one user's key can never replay another's result.

import { createHash } from 'node:crypto';
import { AppError } from './errors.js';

export const KEY_PATTERN = /^[A-Za-z0-9_-]{16,80}$/;
const RETENTION = '14 days';

/** JSON with sorted keys, so the same input always hashes the same. */
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return `{${Object.keys(value).filter((k) => value[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value instanceof Date ? value.toISOString() : value ?? null);
}
export const requestHash = (payload) => createHash('sha256').update(stable(payload)).digest('hex');

/** The Idempotency-Key header: undefined when absent, a 400 when malformed. */
export function readIdempotencyKey(req) {
  const key = req.get('idempotency-key');
  if (key === undefined) return undefined;
  if (!KEY_PATTERN.test(key)) throw new AppError(400, 'BAD_REQUEST', 'Idempotency-Key must be 16–80 letters, digits, "-" or "_"');
  return key;
}

/**
 * Run `run(db)` once per (user, operation, key). Call inside the caller's transaction.
 * `run` returns `{ response, ...extras }`; `response` is what is stored and replayed, `extras` (for after-commit work) are not.
 * @returns {Promise<{ response: any, replayed: boolean, [extra: string]: any }>}
 */
export async function withIdempotency(db, ctx, { operation, key, payload }, run) {
  const hash = requestHash(payload);
  await db.query(`select pg_advisory_xact_lock(hashtext($1))`, [`idem:${ctx.userId}:${operation}:${key}`]);
  const { rows: [prior] } = await db.query(
    `select request_hash, response from idempotency_keys where actor_id = $1 and operation = $2 and key = $3`, [ctx.userId, operation, key]);
  if (prior) {
    if (prior.request_hash !== hash) {
      throw new AppError(409, 'IDEMPOTENCY_KEY_REUSED', 'This request key was already used for a different entry. Start a new entry instead of retrying.');
    }
    return { response: prior.response, replayed: true };
  }
  const out = await run(db);
  const stored = JSON.parse(JSON.stringify(out.response));        // exactly what a JSON response would carry
  await db.query(
    `insert into idempotency_keys (actor_id, operation, key, request_hash, status_code, response) values ($1, $2, $3, $4, 201, $5)`,
    [ctx.userId, operation, key, hash, stored]);
  await db.query(`delete from idempotency_keys where actor_id = $1 and created_at < now() - interval '${RETENTION}'`, [ctx.userId]);
  return { ...out, response: stored, replayed: false };
}
