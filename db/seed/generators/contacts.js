// Offline buyers, suppliers and transporters: the "contacts" the mill deals with before any portal is connected.

import { insertRows } from '../lib/insert.js';

const COLUMNS = ['type', 'name', 'phone', 'email', 'gstin', 'address', 'city'];

export async function seedContacts(db, orgId, profile) {
  return insertRows(db, 'contacts', profile.contacts.map((c) => ({
    org_id: orgId, ...Object.fromEntries(COLUMNS.map((k) => [k, c[k] ?? null])),
  })));
}
