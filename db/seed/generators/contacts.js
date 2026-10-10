// The mill's buyers and suppliers: names on orders, GRNs and invoices. They do not log in.

import { insertRows } from '../lib/insert.js';

const COLUMNS = ['type', 'name', 'phone', 'email', 'gstin', 'address', 'city'];

export async function seedContacts(db, profile) {
  return insertRows(db, 'contacts', profile.contacts.map((c) => Object.fromEntries(COLUMNS.map((k) => [k, c[k] ?? null]))));
}
