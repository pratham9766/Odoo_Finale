// Sends a write that must never be applied twice, and keeps track of it until the outcome is KNOWN.
//
//   begin   → create the idempotency key, persist the entry, send           (one logical submission = one key)
//   resend  → send the same entry again with the SAME key                   (a retry of that submission: safe, the server dedupes)
//   check   → ask the server whether an unconfirmed entry was saved         (GET /idempotency/:operation/:key, never changes anything)
//   discard → forget an entry the server says it never saved                (only after a check, and not within the first minute)
//
// Outcomes: saved | uncertain | rejected | not_sent
//   saved      the server committed it (or already had, replayed = true)
//   uncertain  no answer / server error: it MAY have been saved; the entry stays, with its key, until check/resend settles it
//   rejected   the server answered with a definite refusal (validation, state, permission): nothing was committed, the entry is dropped
//   not_sent   the session ended before it was sent: the entry stays so the same person can send it after signing in again

import { describeError } from '../api/errors.js';
import { DISCARD_AFTER_MS, newOperationKey } from './pendingStore.js';

export function createSubmissionEngine({ store, api, userId, now = Date.now }) {
  async function send(entry) {
    try {
      const res = await api(entry.path, { method: 'POST', body: entry.body, idempotencyKey: entry.id });
      await store.remove(userId, entry.id);
      return { outcome: 'saved', replayed: Boolean(res.meta?.replayed), data: res.data };
    } catch (error) {
      const info = describeError(error, { write: true });
      if (info.kind === 'session') {
        const kept = await store.update(userId, entry.id, { state: 'not_sent', lastError: info.message });
        return { outcome: 'not_sent', entry: kept, error, info };
      }
      if (info.uncertain) {
        const kept = await store.update(userId, entry.id, { state: 'uncertain', lastError: info.message });
        return { outcome: 'uncertain', entry: kept, error, info };
      }
      await store.remove(userId, entry.id);
      return { outcome: 'rejected', error, info };
    }
  }

  return {
    /** @param {{ operation: string, path: string, body: object, label: string, subjectId?: string }} input */
    async begin(input) {
      const entry = { id: newOperationKey(), state: 'sending', createdAt: now(), ...input };
      await store.put(userId, entry);          // persisted BEFORE the request leaves the phone
      return send(entry);
    },

    resend: (entry) => send(entry),

    async check(entry) {
      try {
        const res = await api(`/idempotency/${entry.operation}/${entry.id}`);
        if (res.data.found) {
          await store.remove(userId, entry.id);
          return { outcome: 'saved', replayed: true, data: res.data.response };
        }
        const kept = await store.update(userId, entry.id, { state: 'not_saved', checkedAt: now() });
        return { outcome: 'not_saved', entry: kept };
      } catch (error) {
        return { outcome: 'unknown', error, info: describeError(error) };
      }
    },

    canDiscard: (entry) => entry.state === 'not_saved' && now() - (entry.checkedAt ?? 0) >= DISCARD_AFTER_MS && now() - entry.createdAt >= DISCARD_AFTER_MS,
    async discard(entry) {
      if (!this.canDiscard(entry)) return false;
      await store.remove(userId, entry.id);
      return true;
    },

    list: () => store.list(userId),
  };
}
