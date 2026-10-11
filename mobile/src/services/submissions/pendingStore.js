// Pending submissions: every write that needs the "was it saved?" safety net (production output, new roll) is recorded here BEFORE
// it is sent, under the idempotency key it will be sent with, and removed only when the outcome is known.
//
// An entry survives an app restart. It is never dropped just because the app was reopened: only a confirmed result
// (saved / definitely rejected) or an explicit, informed "discard" removes it. Entries and drafts are scoped to the signed-in
// user, so a second person on the same phone never sees or resends the first person's entry.
//
// `storage` is { get(key): Promise<string|null>, set(key, value): Promise<void>, remove(key): Promise<void> }: SecureStore in the app,
// an in-memory map in the tests.

const INDEX = (userId) => `sameta.pending.${userId}`;
const ENTRY = (userId, id) => `sameta.pending.${userId}.${id}`;
const DRAFT = (userId, name) => `sameta.draft.${userId}.${name}`;
export const KEY_PATTERN = /^[A-Za-z0-9_-]{16,80}$/;
const MAX_ENTRIES = 20;

/** A new idempotency key: unique per logical submission. Time + randomness; scoped by user and operation on the server. */
export function newOperationKey(rand = Math.random) {
  const part = () => Math.floor(rand() * 36 ** 6).toString(36).padStart(6, '0');
  const uuid = globalThis.crypto?.randomUUID?.().replaceAll('-', '');
  return `sm-${Date.now().toString(36)}-${uuid ?? `${part()}${part()}${part()}${part()}`}`;
}

export function createPendingStore(storage) {
  const readJson = async (key, fallback) => {
    try { const raw = await storage.get(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
  };

  async function ids(userId) { return readJson(INDEX(userId), []); }

  return {
    /** All unresolved entries of this user, oldest first. */
    async list(userId) {
      const out = [];
      for (const id of await ids(userId)) {
        const entry = await readJson(ENTRY(userId, id), null);
        if (entry) out.push(entry);
      }
      return out.sort((a, b) => a.createdAt - b.createdAt);
    },

    /** Record an entry. Must complete before the request is sent. */
    async put(userId, entry) {
      if (!KEY_PATTERN.test(entry.id)) throw new Error('Invalid operation key');
      const list = await ids(userId);
      if (!list.includes(entry.id)) {
        if (list.length >= MAX_ENTRIES) throw new Error('Too many unconfirmed entries. Resolve them first.');
        await storage.set(INDEX(userId), JSON.stringify([...list, entry.id]));
      }
      await storage.set(ENTRY(userId, entry.id), JSON.stringify({ ...entry, userId, updatedAt: Date.now() }));
    },

    async update(userId, id, patch) {
      const entry = await readJson(ENTRY(userId, id), null);
      if (!entry) return null;
      const next = { ...entry, ...patch, updatedAt: Date.now() };
      await storage.set(ENTRY(userId, id), JSON.stringify(next));
      return next;
    },

    async remove(userId, id) {
      await storage.remove(ENTRY(userId, id));
      await storage.set(INDEX(userId), JSON.stringify((await ids(userId)).filter((x) => x !== id)));
    },

    /** Drafts of a form being filled in (not yet submitted). */
    async getDraft(userId, name) { return readJson(DRAFT(userId, name), null); },
    async putDraft(userId, name, value) { await storage.set(DRAFT(userId, name), JSON.stringify(value)); },
    async clearDraft(userId, name) { await storage.remove(DRAFT(userId, name)); },
  };
}

/** How long to wait before "discard" is offered for an entry the server never confirmed (a slow first request may still commit). */
export const DISCARD_AFTER_MS = 60_000;
